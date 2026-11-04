"""Run a durable citation worker. One provider request at a time per process."""
import argparse
import asyncio
import json
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")
from services.citation_job_service import run_one


async def run(args):
    job_ids = None
    if args.batch:
        manifest = json.loads(args.batch.read_text(encoding="utf-8"))
        job_ids = [job for jobs in manifest["jobs"].values() for job in jobs]
    while True:
        worked = False
        for job_id in job_ids if job_ids is not None else [None]:
            result = await run_one(job_id)
            if result:
                worked = True
                print(json.dumps(result), flush=True)
                if args.once:
                    return
                # Respect provider cooldowns before trying other papers as well.
                await asyncio.sleep(max(0, args.interval, result.get("retry_after", 0)))
        if not worked:
            if args.once or args.drain:
                return
            await asyncio.sleep(5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Process at most one eligible job")
    mode.add_argument("--drain", action="store_true", help="Stop when no job is currently eligible; delayed retries remain queued")
    parser.add_argument("--batch", type=Path, help="Restrict execution to jobs in a backfill manifest")
    parser.add_argument("--interval", type=float, default=1, help="Seconds between jobs (default 1)")
    try:
        asyncio.run(run(parser.parse_args()))
    except KeyboardInterrupt:
        pass  # An interrupted lease is reclaimed after expiry.
