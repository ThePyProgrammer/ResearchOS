import asyncio

import httpx
import pytest

from services.citation_service import fetch_openalex, fetch_crossref, parse_crossref
from services.openalex_client import CitationProviderError


def run_openalex(paper, works):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={'results': works})
        )) as client:
            return await fetch_openalex(paper, client)
    return asyncio.run(run())


def test_full_references_not_discovery_neighbors():
    work = {'id': 'https://openalex.org/W1', 'doi': 'https://doi.org/10.1234/source',
            'referenced_works': [f'https://openalex.org/W{i}' for i in range(2, 152)],
            'related_works': ['https://openalex.org/W999']}
    result = run_openalex({'doi': '10.1234/source'}, [work])
    assert result.status == 'succeeded'
    assert len(result.references) == 150
    assert result.references[0].identifiers == {'openalex': 'W2'}
    assert all(r.key != 'W999' for r in result.references)


def test_title_only_candidate_never_creates_verified_identity():
    result = run_openalex({'title': 'A paper'}, [{'id': 'https://openalex.org/W1',
        'display_name': 'A paper', 'referenced_works': ['https://openalex.org/W2']}])
    assert result.status == 'not_found'
    assert result.resolution == 'candidate'
    assert result.identities == {}
    assert not result.references


def test_verified_arxiv_identity_supplies_only_unambiguous_doi_alias():
    work = {'id': 'https://openalex.org/W1', 'doi': 'https://doi.org/10.1234/published',
            'locations': [{'landing_page_url': 'https://arxiv.org/abs/2301.12345v2'}], 'referenced_works': []}
    result = run_openalex({'arxiv_id': '2301.12345'}, [work])
    assert result.identities == {'arxiv': '2301.12345', 'doi': '10.1234/published', 'openalex': 'W1'}
    work['locations'].append({'doi': 'https://doi.org/10.1234/another-version'})
    assert 'doi' not in run_openalex({'arxiv_id': '2301.12345'}, [work]).identities


def test_ambiguous_provider_identity_is_not_accepted():
    result = run_openalex({'doi': '10.1234/x'}, [
        {'id': f'https://openalex.org/W{i}', 'doi': '10.1234/x'} for i in (1, 2)])
    assert result.resolution == 'ambiguous'
    assert 'openalex' not in result.identities


def test_missing_list_differs_from_empty():
    work = {'id': 'https://openalex.org/W1', 'doi': '10.1234/x'}
    assert run_openalex({'doi': '10.1234/x'}, [work]).status == 'partial'
    assert run_openalex({'doi': '10.1234/x'}, [{**work, 'referenced_works': []}]).status == 'succeeded'


def test_malformed_reference_is_partial_not_retried_as_exception():
    result = run_openalex({'doi': '10.1234/x'}, [{'id': 'https://openalex.org/W1', 'doi': '10.1234/x',
        'referenced_works': ['https://openalex.org/W2', {'unexpected': 'object'}, 'https://openalex.org/W2']}])
    assert result.status == 'partial'
    assert len(result.references) == 1


def test_crossref_raw_unresolved_and_deduplication():
    result = parse_crossref({'doi': '10.1234/x'}, {'DOI': '10.1234/x', 'reference': [
        {'DOI': '10.1234/TARGET'}, {'unstructured': 'A bibliography entry'}, {'DOI': '10.1234/TARGET'}]})
    assert len(result.references) == 2
    assert result.references[0].identifiers == {'doi': '10.1234/target'}
    assert result.references[1].raw == {'unstructured': 'A bibliography entry'}
    assert result.references[1].identifiers == {}
    assert parse_crossref({'doi': '10.1234/x'}, {'DOI': '10.1234/x'}).status == 'partial'


def test_captured_crossref_avoids_network_and_checks_source():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: pytest.fail('Unexpected network call'))) as client:
            return await fetch_crossref({'doi': '10.1234/x'}, client, {'DOI': '10.1234/x', 'reference': []})
    assert asyncio.run(run()).status == 'succeeded'
    with pytest.raises(CitationProviderError, match='did not match'):
        parse_crossref({'doi': '10.1234/x'}, {'DOI': '10.1234/wrong'})


def test_rate_limit_retains_retry_after_without_secret(monkeypatch):
    monkeypatch.setenv('OPENALEX_API_KEY', 'do-not-leak')
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda req: httpx.Response(429, headers={'Retry-After': '123'})
        )) as client:
            await fetch_openalex({'doi': '10.1234/x'}, client)
    with pytest.raises(CitationProviderError) as caught:
        asyncio.run(run())
    assert caught.value.retryable
    assert caught.value.retry_after == 123
    assert 'do-not-leak' not in str(caught.value)
