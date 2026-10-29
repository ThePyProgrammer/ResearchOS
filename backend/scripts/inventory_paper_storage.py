"""Read-only PDF inventory. Run with uv; see the migration plan for instructions."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit


def source_key(url: str | None, base_url: str, bucket: str) -> str | None:
    if not url:
        return None
    parsed = urlsplit(url)
    base = urlsplit(base_url)
    prefix = f"/storage/v1/object/public/{bucket}/"
    if (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc):
        return None
    if not parsed.path.startswith(prefix):
        return None
    return unquote(parsed.path[len(prefix):]) or None


def list_papers(client, page_size: int = 500) -> list[dict]:
    rows = []
    while True:
        page = (
            client.table("papers")
            .select("id,pdf_url,library_id")
            .order("id")
            .range(len(rows), len(rows) + page_size - 1)
            .execute().data
        )
        if not page:
            return rows
        rows.extend(page)


def list_objects(client, bucket: str, page_size: int = 100) -> list[dict]:
    objects = []
    prefixes = [""]
    visited = set()
    while prefixes:
        prefix = prefixes.pop()
        if prefix in visited:
            continue
        visited.add(prefix)
        offset = 0
        while True:
            page = client.storage.from_(bucket).list(
                prefix,
                {"limit": page_size, "offset": offset,
                 "sortBy": {"column": "name", "order": "asc"}},
            )
            if not page:
                break
            for entry in page:
                key = f"{prefix}/{entry['name']}" if prefix else entry["name"]
                if entry.get("id") is None and entry.get("metadata") is None:
                    prefixes.append(key)
                else:
                    objects.append({**entry, "key": key})
            offset += len(page)
    return objects


def build_report(papers: list[dict], objects: list[dict], base_url: str, bucket: str) -> dict:
    by_key = {obj["key"]: obj for obj in objects}
    references = Counter()
    managed = []
    missing = []
    external = 0
    for paper in papers:
        key = source_key(paper.get("pdf_url"), base_url, bucket)
        if key is None:
            external += bool(paper.get("pdf_url"))
            continue
        references[key] += 1
        entry = {**paper, "source_key": key, "source_exists": key in by_key}
        managed.append(entry)
        if key not in by_key:
            missing.append(entry)
    pdfs = [obj for obj in objects if obj["key"].lower().endswith(".pdf")]
    sizes = [int((obj.get("metadata") or {}).get("size") or 0) for obj in pdfs]
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read-only-inventory",
        "source_bucket": bucket,
        "summary": {
            "paper_rows_visible_to_credentials": len(papers),
            "objects_visible_to_credentials": len(objects),
            "pdf_objects": len(pdfs),
            "pdf_bytes_from_metadata": sum(sizes),
            "largest_pdf_bytes": max(sizes, default=0),
            "managed_paper_references": len(managed),
            "external_or_unrecognized_pdf_urls": external,
            "missing_source_references": len(missing),
            "unreferenced_objects": sum(obj["key"] not in references for obj in objects),
        },
        "warnings": [
            "Inventory includes only rows/objects visible to the supplied credentials; RLS can hide data.",
            "No PDF bytes were downloaded or checksums verified.",
            "Live changes can affect paginated inventory; reconcile under a write pause before cutover.",
            "External/unrecognized URLs need review for custom domains or non-public source URLs.",
        ],
        "papers": papers,
        "managed_references": managed,
        "missing_sources": missing,
        "shared_source_keys": {key: count for key, count in references.items() if count > 1},
        "unreferenced_objects": [obj for obj in objects if obj["key"] not in references],
        "objects": objects,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[1] / ".env")
    parser.add_argument("--bucket", default="pdfs")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "migration" / "paper-inventory.json")
    args = parser.parse_args()
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(args.env_file, override=False)
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "")
    if not base_url or not key or base_url == "*" or key == "*":
        parser.error("Set SUPABASE_URL and SUPABASE_KEY in the environment or backend/.env. Never put credentials in command arguments.")
    if urlsplit(base_url).scheme != "https":
        parser.error("The cloud inventory requires an HTTPS SUPABASE_URL.")
    if args.output.exists():
        parser.error("Output already exists; choose a new --output to preserve the earlier inventory.")
    client = create_client(base_url, key)
    report = build_report(list_papers(client), list_objects(client, args.bucket), base_url, args.bucket)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
    print(json.dumps(report["summary"], indent=2))
    print(f"Inventory saved to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
