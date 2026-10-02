import asyncio
from threading import Event
from types import SimpleNamespace

import httpx
import pytest

from app import app
from models.collection import Collection
from models.paper import Paper
from services import author_service, collection_service, github_repo_service, paper_service, website_service


@pytest.mark.parametrize('service,method', [
    (paper_service, 'list_papers'),
    (website_service, 'list_websites'),
    (github_repo_service, 'list_github_repos'),
])
@pytest.mark.parametrize('collection,status,expected', [
    ('c_1', 'read', [('library_id', 'lib_1'), ('status', 'read')]),
    ('inbox', None, [('library_id', 'lib_1'), ('status', 'inbox')]),
    ('all', None, [('library_id', 'lib_1')]),
])
def test_list_filters_are_sent_to_database(mocker, service, method, collection, status, expected):
    query = mocker.Mock()
    for name in ('select', 'eq', 'contains', 'order'):
        getattr(query, name).return_value = query
    query.execute.return_value = SimpleNamespace(data=[])
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(service, 'get_client', return_value=db)

    assert getattr(service, method)(collection_id=collection, status=status, library_id='lib_1') == []
    assert [call.args for call in query.eq.call_args_list] == expected
    if collection == 'c_1':
        query.contains.assert_called_once_with('collections', ['c_1'])
    else:
        query.contains.assert_not_called()


def test_collection_counts_are_scoped_and_page_beyond_row_limit(mocker):
    query = mocker.Mock()
    for name in ('select', 'order', 'eq', 'range'):
        getattr(query, name).return_value = query
    query.execute.side_effect = [
        SimpleNamespace(data=[{'collections': ['c_1']}] * 500),
        SimpleNamespace(data=[{'collections': ['c_1']}]),
        SimpleNamespace(data=[{'collections': ['c_1']}]),
    ]
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(collection_service, 'get_client', return_value=db)
    result = collection_service._compute_paper_counts(
        [Collection(id='c_1', name='Test', library_id='lib_1')], library_id='lib_1',
    )
    assert result[0].paper_count == 502
    assert [call.args for call in query.eq.call_args_list] == [('library_id', 'lib_1')] * 3
    assert [call.args for call in query.range.call_args_list] == [(0, 499), (500, 999), (0, 499)]


def test_no_count_queries_for_empty_collections(mocker):
    get_client = mocker.patch.object(collection_service, 'get_client')
    assert collection_service._compute_paper_counts([]) == []
    get_client.assert_not_called()


def test_top_authors_reuses_loaded_papers_and_batches_exact_matches(mocker):
    papers = [Paper(
        id=f'p_{i}', title='Test', authors=['Jane Smith', 'Unknown'], year=2026,
        venue='', status='inbox', source='human', created_at='2026-01-01',
    ) for i in range(100)]
    query = mocker.Mock()
    query.select.return_value = query
    query.in_.return_value = query
    query.execute.return_value = SimpleNamespace(data=[{
        'id': 'a_1', 'name': 'Jane Smith', 'name_normalized': 'jane smith',
        'created_at': '2026-01-01',
    }])
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(author_service, 'get_client', return_value=db)
    paper_lookup = mocker.patch.object(paper_service, 'get_paper')
    result = author_service.get_top_authors_for_papers(papers)
    assert [(a.name, a.count) for a in result] == [('Jane Smith', 100), ('Unknown', 100)]
    assert result[0].author.id == 'a_1'
    assert result[1].author is None
    query.in_.assert_called_once_with('name_normalized', ['jane smith', 'unknown'])
    query.execute.assert_called_once()
    paper_lookup.assert_not_called()


@pytest.mark.anyio
async def test_blocking_supabase_reads_can_overlap(mocker):
    paper_started, website_started = Event(), Event()
    overlap = []

    def papers(**kwargs):
        paper_started.set()
        overlap.append(website_started.wait(timeout=2))
        return []

    def websites(**kwargs):
        paper_started.wait(timeout=2)
        website_started.set()
        return []

    mocker.patch('routers.papers.paper_service.list_papers', side_effect=papers)
    mocker.patch('routers.websites.website_service.list_websites', side_effect=websites)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        responses = await asyncio.gather(client.get('/api/papers'), client.get('/api/websites'))
    assert [response.status_code for response in responses] == [200, 200]
    assert overlap == [True]
