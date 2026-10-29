"""Review or remove verified superseded Supabase PDFs after the recovery window."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path

from copy_paper_storage import fingerprint
from inventory_paper_storage import list_objects, list_papers
from switch_paper_urls import append_record


def eligible_sources(plan, papers, sources, destinations):
    by_id = {row['id']: row for row in papers}
    active_urls = {row.get('pdf_url') for row in papers}
    eligible, skipped = [], []
    for entry in plan:
        key = entry['key']
        if key not in sources:
            continue
        row, dest = by_id.get(entry['paper_id']), destinations.get(key)
        if (row is None or row.get('pdf_url') != entry['new_url'] or entry['old_url'] in active_urls
                or fingerprint(sources[key]) != tuple(entry['source_fingerprint'])
                or dest is None or int(dest.generation) != entry['generation']
                or int(dest.size) != entry['bytes']
                or (dest.metadata or {}).get('researchos-source-sha256') != entry['sha256']):
            skipped.append(key)
        else:
            eligible.append(key)
    return eligible, skipped


def main():
    root = Path(__file__).resolve().parents[1]
    folder = root / 'data/migration'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', type=Path, default=folder / 'url-cutover-backup.json')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    from dotenv import load_dotenv
    from google.cloud import storage
    from supabase import create_client

    backup = json.loads(args.backup.read_text(encoding='utf-8'))
    load_dotenv(root / '.env', override=False)
    if os.environ['SUPABASE_URL'].rstrip('/') != backup['source_url']:
        raise ValueError('Backup belongs to a different Supabase project')
    if args.execute and datetime.now(timezone.utc) < datetime.fromisoformat(backup['created_at']) + timedelta(days=7):
        parser.error('The seven-day recovery window has not elapsed; dry-run only for now')
    if args.execute and not (folder / 'maintenance.flag').exists():
        parser.error('Pause local writes with backend/data/migration/maintenance.flag before source cleanup')
    db = create_client(backup['source_url'], os.environ['SUPABASE_KEY'])
    papers = list_papers(db)
    sources = {obj['key']: obj for obj in list_objects(db, backup['source_bucket'])}
    destinations = {obj.name: obj for obj in storage.Client(project=os.environ.get('GCS_PROJECT_ID')).list_blobs(backup['bucket'])}
    eligible, skipped = eligible_sources(backup['plan'], papers, sources, destinations)
    print(json.dumps({'execute': args.execute, 'eligible_objects': len(eligible),
                      'eligible_bytes': sum(int(sources[key]['metadata']['size']) for key in eligible),
                      'skipped_for_review': skipped,
                      'recovery_window_ends': (datetime.fromisoformat(backup['created_at']) + timedelta(days=7)).isoformat()}, indent=2))
    if args.execute:
        for key in eligible:
            append_record(folder / 'source-cleanup-journal.jsonl', {'key': key, 'status': 'pending'})
            db.storage.from_(backup['source_bucket']).remove([key])
            append_record(folder / 'source-cleanup-journal.jsonl', {'key': key, 'status': 'removed'})
        print('Source cleanup complete. Unreferenced and changed objects were not deleted.')


if __name__ == '__main__':
    main()
