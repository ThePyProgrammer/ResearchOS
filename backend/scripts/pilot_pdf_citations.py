"""Extract one managed PDF through configured GROBID without changing the database."""
import argparse
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from dotenv import load_dotenv
load_dotenv(BACKEND / '.env')
import httpx
from services import paper_service
from services.citation_identity_service import local_identifiers
from services.pdf_reference_service import configured_url, fetch_pdf_references
from services.openalex_client import CitationProviderError


async def run(args):
    paper = paper_service.get_paper(args.paper_id)
    if paper is None:
        raise ValueError('Paper not found')
    async with httpx.AsyncClient(timeout=30) as client:
        result = await fetch_pdf_references(paper.model_dump(), client)
    identities = defaultdict(set)
    targets = {}
    # A missing library ID is a distinct scope, never an implicit cross-library match.
    for target in paper_service.iter_papers(library_id=paper.library_id, all_libraries=paper.library_id is None):
        if target.get('library_id') != paper.library_id:
            continue
        targets[target['id']] = target
        for kind, value in local_identifiers(target).items():
            identities[(kind, value)].add(target['id'])
    matches = []
    for ref in result.references:
        ids = set()
        for kind, value in ref.identifiers.items():
            ids.update(identities[(kind, value)])
        if len(ids) == 1:
            target = targets[next(iter(ids))]
            source_ids = local_identifiers(paper.model_dump())
            if target['id'] != paper.id and not any(source_ids.get(k) == v for k,v in local_identifiers(target).items()):
                matches.append({'reference_key':ref.key, 'paper_id':target['id'], 'title':target['title']})
    report = {'created_at':datetime.now(timezone.utc).isoformat(), 'paper_id':paper.id,
              'library_id':paper.library_id, 'extraction':result.model_dump(), 'local_matches':matches,
              'matching_note':'Exact local DOI/arXiv identifiers only; provider aliases and title candidates are excluded.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps({'status':result.status, 'references':len(result.references),
                      'matched_reference_records':len(matches), 'output':str(args.output)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--paper-id', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Choose a new output path; existing pilot reports are not overwritten')
    try:
        if not configured_url():
            parser.error('Configure a self-hosted GROBID_URL before sending a PDF for extraction')
        asyncio.run(run(args))
    except (ValueError, CitationProviderError) as exc:
        parser.exit(1, f'{exc}\n')
