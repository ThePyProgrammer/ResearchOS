"""Select a bounded backfill and enqueue durable jobs. No provider calls here."""
import argparse
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")
from services import citation_repository, paper_service


def save_manifest(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--library-id")
    scope.add_argument("--all-libraries", action="store_true")
    scope.add_argument("--resume", type=Path, help="Resume an existing batch manifest")
    parser.add_argument("--limit", type=int, default=0, help="0 selects all papers in scope")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--refresh", action="store_true", help="Also requeue completed jobs")
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit must be nonnegative")
    if args.resume:
        manifest = args.resume
        batch = json.loads(manifest.read_text(encoding="utf-8"))
    else:
        papers = []
        for paper in paper_service.iter_papers(library_id=args.library_id, all_libraries=args.all_libraries):
            papers.append(paper["id"])
            if args.limit and len(papers) >= args.limit:
                break
        batch = {"id": str(uuid4()), "library_id": args.library_id, "all_libraries": args.all_libraries,
                 "paper_ids": papers, "jobs": {}, "refresh": args.refresh}
        manifest = BACKEND / "data" / "citations" / f"{batch['id']}.json"
    if args.dry_run:
        print(json.dumps({"papers": len(batch["paper_ids"]), "already_enqueued": len(batch["jobs"]),
                          "library_id": batch["library_id"], "all_libraries": batch["all_libraries"]}))
        return
    save_manifest(manifest, batch)
    for paper_id in batch["paper_ids"]:
        if paper_id in batch["jobs"]:
            continue
        jobs = citation_repository.enqueue(paper_id, batch["refresh"])
        batch["jobs"][paper_id] = [job["id"] for job in jobs]
        save_manifest(manifest, batch)
    print(json.dumps({"batch": str(manifest), "papers": len(batch["jobs"])}))


if __name__ == "__main__":
    main()
