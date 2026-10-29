"""Copy referenced PDFs to GCS and verify bytes. Never updates URLs or deletes files."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile

from inventory_paper_storage import source_key


def lookup_source(client, bucket, key):
    """Read one folder with a filename search instead of the whole bucket."""
    parent, _, name = key.rpartition("/")
    offset = 0
    while True:
        page = client.storage.from_(bucket).list(parent, {
            "search": name, "limit": 100, "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
        })
        if not page:
            return None
        for obj in page:
            if obj["name"] == name:
                return {**obj, "key": key}
        offset += len(page)


def fingerprint(obj):
    metadata = obj.get("metadata") or {}
    return (obj.get("id"), obj.get("version"), obj.get("updated_at"),
            metadata.get("size"), metadata.get("eTag"))


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def select_entries(report, limit):
    objects = {obj["key"]: obj for obj in report["objects"]}
    entries = []
    seen = set()
    for entry in report["managed_references"]:
        key = entry["source_key"]
        if key in objects and key not in seen and key.lower().endswith(".pdf"):
            seen.add(key)
            entries.append({**entry, "object": objects[key]})
    entries.sort(key=lambda entry: (int((entry["object"].get("metadata") or {}).get("size") or 0), entry["source_key"]))
    if limit == 3 and len(entries) > 3:
        return [entries[0], entries[len(entries) // 2], entries[-1]]
    return entries if limit == 0 else entries[:limit]


def copy_one(entry, bucket, http, source_client, source_bucket, base_url, previous=None):
    key = entry["source_key"]
    if source_key(entry["pdf_url"], base_url, source_bucket) != key:
        raise ValueError("Source URL does not match the configured project/bucket/key")
    # Check the current database reference before copying an inventoried file.
    rows = source_client.table("papers").select("id,pdf_url").eq("id", entry["id"]).execute().data
    if not rows or rows[0]["pdf_url"] != entry["pdf_url"]:
        raise ValueError("Paper was removed or its PDF reference changed; refresh inventory")
    before = lookup_source(source_client, source_bucket, key)
    if before is None or fingerprint(before) != fingerprint(entry["object"]):
        raise ValueError("Source changed since inventory; refresh inventory")
    if (previous and previous.get('status') == 'copied_verified'
            and previous.get('original_url') == entry['pdf_url']
            and previous.get('destination_bucket') == bucket.name
            and previous.get('destination_key') == key
            and tuple(previous['source_fingerprint']) == fingerprint(before)):
        existing = bucket.get_blob(key)
        if (existing is not None and int(existing.generation) == previous['destination_generation']
                and int(existing.size) == previous['bytes']
                and (existing.metadata or {}).get('researchos-source-sha256') == previous['sha256']):
            return {**previous, 'created': False, 'verification': 'previously-hashed-generation-unchanged'}
    with tempfile.TemporaryDirectory(prefix="researchos-pdf-") as tmp:
        source = Path(tmp) / "source.pdf"
        destination = Path(tmp) / "destination.pdf"
        expected_size = int(entry["object"]["metadata"]["size"])
        downloaded = 0
        with http.stream("GET", entry["pdf_url"]) as response:
            response.raise_for_status()
            with source.open("wb") as handle:
                for chunk in response.iter_bytes(1024 * 1024):
                    downloaded += len(chunk)
                    if downloaded > expected_size:
                        raise ValueError("Source exceeds inventoried size")
                    handle.write(chunk)
        with source.open("rb") as handle:
            if handle.read(5) != b"%PDF-":
                raise ValueError("Source does not have a PDF header")
        if downloaded != expected_size:
            raise ValueError("Source size differs from inventory")
        source_sha = digest(source)
        after = lookup_source(source_client, source_bucket, key)
        if after is None or fingerprint(after) != fingerprint(before):
            raise ValueError("Source changed during download")
        blob = bucket.get_blob(key)
        created = blob is None
        if created:
            blob = bucket.blob(key, chunk_size=8 * 1024 * 1024)
            blob.cache_control = "no-cache"
            blob.content_disposition = "inline"
            blob.metadata = {"researchos-source-sha256": source_sha}
            blob.upload_from_filename(str(source), content_type="application/pdf",
                                      if_generation_match=0, checksum="auto", timeout=120)
        generation = int(blob.generation)
        # Pin the read to the exact generation; never verify a different version.
        bucket.blob(key, generation=generation).download_to_filename(
            str(destination), if_generation_match=generation, checksum="auto", timeout=120)
        if destination.stat().st_size != downloaded or digest(destination) != source_sha:
            raise ValueError("Destination checksum/size mismatch; existing object was not overwritten")
        return {"paper_id": entry["id"], "source_key": key,
                "original_url": entry["pdf_url"], "source_fingerprint": fingerprint(after),
                "destination_bucket": bucket.name, "destination_key": key,
                "destination_generation": generation, "bytes": downloaded,
                "sha256": source_sha, "created": created, "status": "copied_verified"}


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=root / "data/migration/paper-inventory.json")
    parser.add_argument("--env-file", type=Path, default=root / ".env")
    parser.add_argument("--project", default="researchos-513104")
    parser.add_argument("--bucket", default="researchos-papers")
    parser.add_argument("--limit", type=int, default=3, help="Default: small/median/large pilot; 0: all referenced PDFs")
    parser.add_argument("--journal", type=Path, default=root / "data/migration/copy-journal.jsonl")
    parser.add_argument("--execute", action="store_true", help="Actually copy; otherwise show selection only")
    parser.add_argument("--workers", type=int, default=1, help="Concurrent transfers (1-8)")
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit must be nonnegative")
    if not 1 <= args.workers <= 8:
        parser.error('--workers must be between 1 and 8')
    report = json.loads(args.inventory.read_text(encoding="utf-8-sig"))
    entries = select_entries(report, args.limit)
    print(json.dumps({"mode": "copy-and-verify" if args.execute else "dry-run",
                      "bucket": args.bucket, "selected": len(entries),
                      "bytes": sum(int(e["object"]["metadata"]["size"]) for e in entries)}, indent=2), flush=True)
    if not args.execute:
        return 0
    from dotenv import load_dotenv
    from google.cloud import storage
    import httpx
    from supabase import create_client

    load_dotenv(args.env_file, override=False)
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_KEY", "")
    if not base_url.startswith("https://") or not secret:
        parser.error("Configure SUPABASE_URL and SUPABASE_KEY locally")
    source = create_client(base_url, secret)
    target = storage.Client(project=args.project).bucket(args.bucket)
    args.journal.parent.mkdir(parents=True, exist_ok=True)
    previous = {}
    if args.journal.exists():
        for line in args.journal.read_text(encoding='utf-8').splitlines():
            record = json.loads(line)
            previous[record['source_key']] = record
    failed = False
    with httpx.Client(timeout=120, follow_redirects=False, headers={"Accept-Encoding": "identity"}) as http, ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(copy_one, entry, target, http, source, report['source_bucket'], base_url,
                               previous.get(entry['source_key'])): entry for entry in entries}
        for future in as_completed(futures):
            entry = futures[future]
            if future.cancelled():
                continue
            try:
                record = future.result()
            except Exception as error:
                # Avoid logging exception messages that can contain credential-bearing URLs.
                record = {"source_key": entry["source_key"], "status": "failed",
                          "error_type": type(error).__name__}
                if isinstance(error, ValueError):
                    record["detail"] = str(error)
            record["recorded_at"] = datetime.now(timezone.utc).isoformat()
            with args.journal.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record) + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            print(json.dumps({key: value for key, value in record.items()
                              if key in ("source_key", "status", "bytes", "created", "error_type", "detail")}), flush=True)
            if record["status"] == "failed":
                failed = True
                for pending in futures:
                    pending.cancel()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
