import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from models.citation import CitationResult
from services import citation_job_service as jobs, paper_service
from services.openalex_client import CitationProviderError


def setup_job(monkeypatch, provider='openalex'):
    job = {'id': 'job1', 'paper_id': 'p1', 'provider': provider, 'lease_token': 'lease', 'attempts': 1}
    monkeypatch.setattr(jobs.repository, 'claim', lambda job_id=None: job)
    monkeypatch.setattr(jobs.paper_service, 'get_paper', lambda _: SimpleNamespace(model_dump=lambda: {'id': 'p1'}))
    return job


def test_worker_publish_and_stale_fencing(monkeypatch):
    setup_job(monkeypatch)
    monkeypatch.setattr(jobs, 'fetch_openalex', AsyncMock(return_value=CitationResult(provider='openalex')))
    monkeypatch.setattr(jobs.repository, 'finish', lambda job, result: False)
    assert asyncio.run(jobs.run_one()) == {'id': 'job1', 'status': 'superseded'}


def test_retryable_failure_preserves_retry_after(monkeypatch, mocker):
    setup_job(monkeypatch)
    monkeypatch.setattr(jobs, 'fetch_openalex', AsyncMock(side_effect=CitationProviderError('HTTP 429', retryable=True, retry_after=240)))
    failure = mocker.patch.object(jobs.repository, 'fail')
    assert asyncio.run(jobs.run_one())['status'] == 'retry_pending'
    assert failure.call_args.kwargs == {'retry': True, 'retry_seconds': 240}


def test_no_job_does_not_fetch(monkeypatch, mocker):
    monkeypatch.setattr(jobs.repository, 'claim', lambda _: None)
    fetch = mocker.patch.object(jobs, 'fetch_openalex')
    assert asyncio.run(jobs.run_one()) is None
    fetch.assert_not_called()


def test_crossref_captured_payload_passed_to_fetcher(monkeypatch):
    job = setup_job(monkeypatch, 'crossref')
    job['captured_record'] = {'DOI': '10.1234/x'}
    fetch = AsyncMock(return_value=CitationResult(provider='crossref'))
    monkeypatch.setattr(jobs, 'fetch_crossref', fetch)
    monkeypatch.setattr(jobs.repository, 'finish', lambda job, result: True)
    assert asyncio.run(jobs.run_one())['status'] == 'succeeded'
    assert fetch.call_args.args[2] == job['captured_record']


def test_pdf_job_uses_pdf_extractor_and_publishes_evidence(monkeypatch):
    setup_job(monkeypatch, 'grobid')
    fetch = AsyncMock(return_value=CitationResult(provider='grobid', version='grobid:test;sha256:pdf'))
    monkeypatch.setattr(jobs, 'fetch_pdf_references', fetch)
    monkeypatch.setattr(jobs, 'fetch_crossref', AsyncMock(side_effect=AssertionError('Wrong provider')))
    monkeypatch.setattr(jobs.repository, 'finish', lambda job, result: result.provider == 'grobid')
    assert asyncio.run(jobs.run_one())['status'] == 'succeeded'
    fetch.assert_awaited_once()


def test_keyset_iterator_handles_server_page_caps(monkeypatch):
    rows = [{'id': f'p{i:04}', 'library_id': 'lib'} for i in range(1105)]
    class Query:
        def __init__(self):
            self.after = ''; self.upper = 'z'; self.desc = False; self.size = 500
        def select(self, *_): return self
        def eq(self, *_): return self
        def gt(self, _, value): self.after = value; return self
        def lte(self, _, value): self.upper = value; return self
        def order(self, _, desc=False): self.desc = desc; return self
        def limit(self, size): self.size = size; return self
        def execute(self):
            selected = [r for r in rows if self.after < r['id'] <= self.upper]
            selected.sort(key=lambda r: r['id'], reverse=self.desc)
            return SimpleNamespace(data=selected[:min(self.size, 100)])
    monkeypatch.setattr(paper_service, 'get_client', lambda: SimpleNamespace(table=lambda _: Query()))
    assert list(paper_service.iter_papers(library_id='lib')) == rows
