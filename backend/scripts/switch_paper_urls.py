"""Preflight and journal verified PDF URL updates, with guarded rollback."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from urllib.parse import quote

from copy_paper_storage import fingerprint
from inventory_paper_storage import list_objects, list_papers, source_key


def build_plan(report, verified, base_url, bucket):
    objects = {obj['key']: obj for obj in report['objects']}
    plan = []
    for entry in report['managed_references']:
        key = entry['source_key']
        record = verified.get(key)
        if source_key(entry['pdf_url'], base_url, report['source_bucket']) != key:
            raise ValueError('Inventory URL does not match the configured source')
        if not record or record['status'] != 'copied_verified':
            raise ValueError(f'No verified copy: {key}')
        if (record['destination_bucket'] != bucket or record['destination_key'] != key
                or record['original_url'] != entry['pdf_url']
                or tuple(record['source_fingerprint']) != fingerprint(objects[key])):
            raise ValueError(f'Copy does not match inventory: {key}')
        plan.append({
            'paper_id': entry['id'], 'old_url': entry['pdf_url'],
            'new_url': f'https://storage.googleapis.com/{bucket}/{quote(key, safe="/")}',
            'key': key, 'generation': record['destination_generation'],
            'bytes': record['bytes'], 'sha256': record['sha256'],
            'source_fingerprint': record['source_fingerprint'],
        })
    if not plan:
        raise ValueError('No managed references found')
    if report.get('missing_sources') or report.get('shared_source_keys'):
        raise ValueError('Resolve missing/shared source references before cutover')
    return plan


def validate_plan(plan, current_papers, current_objects, destination_objects, rollback=False):
    papers = {row['id']: row for row in current_papers}
    sources = {obj['key']: obj for obj in current_objects}
    for entry in plan:
        row = papers.get(entry['paper_id'])
        expected, desired = (entry['new_url'], entry['old_url']) if rollback else (entry['old_url'], entry['new_url'])
        if row is None or row.get('pdf_url') not in (expected, desired):
            raise ValueError(f'Paper changed or deleted: {entry["paper_id"]}')
        source = sources.get(entry['key'])
        if source is None or fingerprint(source) != tuple(entry['source_fingerprint']):
            raise ValueError(f'Source changed or deleted: {entry["key"]}')
        destination = destination_objects.get(entry['key'])
        if (destination is None or int(destination.generation) != int(entry['generation'])
                or int(destination.size) != entry['bytes']
                or (destination.metadata or {}).get('researchos-source-sha256') != entry['sha256']):
            raise ValueError(f'Destination changed or unverified: {entry["key"]}')


def append_record(path, record):
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps({**record, 'recorded_at': datetime.now(timezone.utc).isoformat()}) + '\n')
        handle.flush()
        os.fsync(handle.fileno())


def main():
    root = Path(__file__).resolve().parents[1]
    folder = root / 'data/migration'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, default=folder / 'pre-copy-inventory.json')
    parser.add_argument('--copy-journal', type=Path, default=folder / 'copy-journal.jsonl')
    parser.add_argument('--backup', type=Path, default=folder / 'url-cutover-backup.json')
    parser.add_argument('--journal', type=Path, default=folder / 'url-cutover-journal.jsonl')
    parser.add_argument('--project', default='researchos-513104')
    parser.add_argument('--bucket', default='researchos-papers')
    parser.add_argument('--rollback', action='store_true')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    from dotenv import load_dotenv
    from google.cloud import storage
    from supabase import create_client

    load_dotenv(root / '.env', override=False)
    base_url = os.environ['SUPABASE_URL'].rstrip('/')
    db = create_client(base_url, os.environ['SUPABASE_KEY'])
    if args.backup.exists():
        backup = json.loads(args.backup.read_text(encoding='utf-8'))
        if backup['bucket'] != args.bucket or backup['source_url'] != base_url:
            raise ValueError('Backup belongs to a different source or destination')
        plan = backup['plan']
        source_bucket = backup['source_bucket']
    else:
        if args.rollback:
            parser.error('Rollback requires an existing cutover backup')
        report = json.loads(args.inventory.read_text(encoding='utf-8'))
        verified = {}
        for line in args.copy_journal.read_text(encoding='utf-8').splitlines():
            record = json.loads(line)
            verified[record['source_key']] = record
        plan = build_plan(report, verified, base_url, args.bucket)
        source_bucket = report['source_bucket']
    papers = list_papers(db)
    source_objects = list_objects(db, source_bucket)
    destinations = {obj.name: obj for obj in storage.Client(project=args.project).list_blobs(args.bucket)}
    validate_plan(plan, papers, source_objects, destinations, args.rollback)
    # Detect new source references that were not included in the transfer plan.
    planned_ids = {entry['paper_id'] for entry in plan}
    if any(row['id'] not in planned_ids and source_key(row.get('pdf_url'), base_url, source_bucket)
           for row in papers):
        raise ValueError('New source references appeared; reconcile inventory before cutover')
    print(json.dumps({'mode': 'rollback' if args.rollback else 'apply-urls',
                      'execute': args.execute, 'verified_plan_rows': len(plan)}, indent=2), flush=True)
    if not args.execute:
        return 0
    if not (folder / 'maintenance.flag').exists():
        parser.error('Pause local application writes with backend/data/migration/maintenance.flag first')
    if not args.backup.exists():
        rows = []
        while True:
            page = db.table('papers').select('*').order('id').range(len(rows), len(rows) + 499).execute().data
            if not page:
                break
            rows.extend(page)
        with args.backup.open('x', encoding='utf-8') as handle:
            json.dump({'source_url': base_url, 'source_bucket': source_bucket, 'bucket': args.bucket,
                       'created_at': datetime.now(timezone.utc).isoformat(),
                       'plan': plan, 'paper_rows_before': rows}, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
    count = 0
    for entry in plan:
        old, new = (entry['new_url'], entry['old_url']) if args.rollback else (entry['old_url'], entry['new_url'])
        append_record(args.journal, {'paper_id': entry['paper_id'], 'old_url': old,
                                    'new_url': new, 'status': 'pending'})
        updated = db.table('papers').update({'pdf_url': new}).eq('id', entry['paper_id']).eq('pdf_url', old).execute().data
        if not updated:
            current = db.table('papers').select('pdf_url').eq('id', entry['paper_id']).execute().data
            if not current or current[0]['pdf_url'] != new:
                raise ValueError(f'Concurrent URL conflict: {entry["paper_id"]}')
        append_record(args.journal, {'paper_id': entry['paper_id'], 'old_url': old,
                                    'new_url': new, 'status': 'confirmed'})
        count += 1
        if count % 25 == 0 or count == len(plan):
            print(f'Confirmed {count}/{len(plan)} URL updates', flush=True)
    after = list_papers(db)
    desired_by_id = {entry['paper_id']: entry['old_url'] if args.rollback else entry['new_url'] for entry in plan}
    for row in after:
        if row['id'] in desired_by_id and row.get('pdf_url') != desired_by_id[row['id']]:
            raise ValueError('Post-cutover URL verification failed')
    if {row['id'] for row in after} != {row['id'] for row in papers}:
        raise ValueError('Paper IDs changed during cutover')
    print(f'URL verification passed; {len(after)} paper IDs preserved.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
