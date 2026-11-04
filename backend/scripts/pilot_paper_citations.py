"""Read-only coverage pilot. Fetch public metadata and write a local report; never mutate the database."""
import argparse
import asyncio
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from dotenv import load_dotenv
load_dotenv(BACKEND / '.env')
import httpx
from services import openalex_client, paper_service
from services.citation_service import fetch_crossref, fetch_openalex
from services.citation_identity_service import exact_work_match, local_identifiers, openalex_id, work_identifiers
from services.openalex_client import CitationProviderError


def stratum(paper):
    ids = local_identifiers(paper)
    return 'doi' if ids.get('doi') else 'arxiv' if ids.get('arxiv') else 'pdf_only' if paper.get('pdf_url') else 'metadata_only'


async def pilot(args):
    start = time.monotonic()
    papers = list(paper_service.iter_papers(library_id=args.library_id, all_libraries=args.all_libraries))
    groups = defaultdict(list)
    for paper in papers:
        groups[stratum(paper)].append(paper)
    selected = [p for kind in ('doi', 'arxiv', 'pdf_only') for p in sorted(groups[kind], key=lambda p: p['id'])[:args.per_stratum]]
    report = {'created_at': datetime.now(timezone.utc).isoformat(), 'scope': args.library_id or 'all-libraries',
              'population': len(papers), 'strata': {k: len(v) for k,v in groups.items()},
              'sources': [], 'edges': [], 'errors': [], 'target_resolution_complete': True}
    lookup = defaultdict(set)
    by_id = {p['id']: p for p in papers}
    for paper in papers:
        for kind, value in local_identifiers(paper).items():
            lookup[(kind,value)].add(paper['id'])
    openalex_local = defaultdict(set)
    requested = set()
    stopped = set()
    requests = 0
    async def count_request(request):
        nonlocal requests
        requests += 1
    def checkpoint():
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, event_hooks={'request':[count_request]},
                                 headers={'User-Agent':'ResearchOS-Citation-Pilot/1.0'}) as client:
        for paper in selected:
            source = {k: paper.get(k) for k in ('id','title','library_id','doi','arxiv_id','pdf_url')}
            source['stratum'] = stratum(paper)
            source['providers'] = {}
            for provider, fetch in (('openalex',fetch_openalex), ('crossref',fetch_crossref)):
                if provider in stopped:
                    source['providers'][provider] = {'status':'skipped', 'reason':'Provider authentication/rate limit stopped this pilot'}
                    continue
                try:
                    result = await fetch(paper, client)
                    source['providers'][provider] = result.model_dump()
                    if result.identities.get('openalex'):
                        openalex_local[result.identities['openalex']].add(paper['id'])
                    requested.update(r.identifiers['openalex'] for r in result.references if r.identifiers.get('openalex'))
                except CitationProviderError as exc:
                    source['providers'][provider] = {'status':'failed','reason':str(exc)}
                    report['errors'].append({'provider':provider,'paper_id':paper['id'],'message':str(exc)})
                    if any(code in str(exc) for code in ('401','403','429')):
                        stopped.add(provider)
                await asyncio.sleep(args.interval)
            report['sources'].append(source)
            checkpoint()
            print(json.dumps({'source':paper['id'],'stratum':source['stratum'],
                              'statuses':{k:v['status'] for k,v in source['providers'].items()}}),flush=True)
        # Resolve reference identities against the whole local population, not only sampled sources.
        target_ids = sorted(requested - set(openalex_local))
        for offset in range(0,len(target_ids),100):
            if 'openalex' in stopped:
                report['target_resolution_complete'] = False
                break
            try:
                works = await openalex_client.search(client, filter='openalex:'+'|'.join(target_ids[offset:offset+100]),
                                                    per_page=100, select='id,doi,ids,locations,display_name')
                for work in works:
                    wid = openalex_id(work.get('id'))
                    for kind,values in work_identifiers(work).items():
                        for value in values:
                            for pid in lookup[(kind,value)]:
                                if wid and exact_work_match(by_id[pid],work):
                                    openalex_local[wid].add(pid)
            except CitationProviderError as exc:
                report['errors'].append({'provider':'openalex-targets','message':str(exc)})
                report['target_resolution_complete'] = False
                break
            await asyncio.sleep(args.interval)
    for source in report['sources']:
        for provider,data in source['providers'].items():
            if data['status']!='succeeded':
                continue
            for ref in data['references']:
                matches = set()
                for kind,value in ref['identifiers'].items():
                    candidates = openalex_local[value] if kind=='openalex' else lookup[(kind,value)]
                    matches.update(pid for pid in candidates if by_id[pid].get('library_id')==source['library_id'])
                if len(matches)!=1:
                    continue
                target = by_id[next(iter(matches))]
                if target['id']==source['id']:
                    continue
                srcids = local_identifiers(source)
                if any(srcids.get(k)==v for k,v in local_identifiers(target).items()):
                    continue
                report['edges'].append({'source_id':source['id'],'source_title':source['title'],
                    'target_id':target['id'],'target_title':target['title'],'provider':provider,'reference':ref['raw']})
    report['requests'] = requests
    report['elapsed_seconds'] = round(time.monotonic()-start,1)
    report['unique_pairs'] = len({(e['source_id'],e['target_id']) for e in report['edges']})
    report['provider_statuses'] = {name:dict(Counter(s['providers'][name]['status'] for s in report['sources'])) for name in ('openalex','crossref')}
    checkpoint()
    print(json.dumps({k:report[k] for k in ('population','provider_statuses','unique_pairs','requests','elapsed_seconds','errors')}))


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument('--library-id')
    scope.add_argument('--all-libraries',action='store_true')
    parser.add_argument('--per-stratum',type=int,default=10)
    parser.add_argument('--interval',type=float,default=1)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    if args.per_stratum<1 or args.interval<0:
        parser.error('Sample size must be positive and interval nonnegative')
    if args.output.exists():
        parser.error('Choose a new output path; existing pilot reports are not overwritten')
    asyncio.run(pilot(args))
