from types import SimpleNamespace

import pytest

from models.bulk_items import BulkItemsRequest
from services import bulk_item_service
from services import paper_service, website_service, github_repo_service
from models.paper import PaperUpdate
from models.website import WebsiteUpdate
from models.github_repo import GitHubRepoUpdate


def setup_db(mocker, responses):
    query = mocker.Mock()
    for name in ('select', 'eq', 'in_', 'update', 'delete'):
        getattr(query, name).return_value = query
    query.execute.side_effect = [
        value if isinstance(value, Exception) else SimpleNamespace(data=value)
        for value in responses
    ]
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(bulk_item_service, 'get_client', return_value=db)
    return query


def test_status_100_papers_uses_one_write(mocker):
    ids = [f'p_{i}' for i in range(100)]
    query = setup_db(mocker, [[{'id': value} for value in ids]])
    result = bulk_item_service.mutate_items(BulkItemsRequest(
        items=[{'id': value} for value in ids], action='status', status='read', library_id='lib_1',
    ))
    assert result.succeeded_ids == ids
    assert result.failed == []
    query.update.assert_called_once_with({'status': 'read'})
    query.in_.assert_called_once_with('id', ids)
    query.eq.assert_called_once_with('library_id', 'lib_1')
    query.execute.assert_called_once()
    query.select.assert_not_called()


def test_missing_rows_and_failed_types_do_not_hide_success(mocker):
    setup_db(mocker, [[{'id': 'p_1'}], RuntimeError('private database error'), [{'id': 'gh_1'}]])
    result = bulk_item_service.mutate_items(BulkItemsRequest(items=[
        {'id': 'p_1'}, {'id': 'p_missing'}, {'id': 'w_1', 'itemType': 'website'},
        {'id': 'gh_1', 'itemType': 'github_repo'},
    ], action='status', status='read'))
    assert result.succeeded_ids == ['p_1', 'gh_1']
    assert [item.id for item in result.failed] == ['p_missing', 'w_1']
    assert 'private database error' not in result.model_dump_json()


def test_bulk_delete_confirms_only_deleted_ids(mocker):
    query = setup_db(mocker, [[{'id': 'p_1'}]])
    result = bulk_item_service.mutate_items(BulkItemsRequest(
        items=[{'id': 'p_1'}, {'id': 'p_missing'}], action='delete',
    ))
    assert result.succeeded_ids == ['p_1']
    assert result.failed[0].id == 'p_missing'
    query.delete.assert_called_once()
    query.execute.assert_called_once()


def test_collection_add_groups_writes_and_preserves_existing_memberships(mocker):
    query = setup_db(mocker, [
        [{'id': 'c_new'}],
        [{'id': 'p_1', 'collections': ['c_old']}, {'id': 'p_2', 'collections': ['c_old']},
         {'id': 'p_done', 'collections': ['c_new']}],
        [{'id': 'p_1'}, {'id': 'p_2'}],
    ])
    result = bulk_item_service.mutate_items(BulkItemsRequest(
        items=[{'id': 'p_1'}, {'id': 'p_2'}, {'id': 'p_done'}],
        action='add_to_collection', collection_id='c_new',
    ))
    assert result.succeeded_ids == ['p_1', 'p_2', 'p_done']
    query.update.assert_called_once_with({'collections': ['c_old', 'c_new']})
    assert mocker.call('collections', '["c_old"]') in query.eq.call_args_list


def test_concurrent_collection_change_is_reported_as_failure(mocker):
    setup_db(mocker, [[{'id': 'c_new'}], [{'id': 'p_1', 'collections': []}], []])
    result = bulk_item_service.mutate_items(BulkItemsRequest(
        items=[{'id': 'p_1'}], action='add_to_collection', collection_id='c_new',
    ))
    assert result.succeeded_ids == []
    assert result.failed[0].id == 'p_1'


@pytest.mark.parametrize('payload', [
    {'items': [], 'action': 'delete'},
    {'items': [{'id': 'p'}] * 101, 'action': 'delete'},
    {'items': [{'id': 'p'}, {'id': 'p'}], 'action': 'delete'},
    {'items': [{'id': 'p'}], 'action': 'status'},
    {'items': [{'id': 'p'}], 'action': 'status', 'status': 'invalid'},
    {'items': [{'id': 'p'}], 'action': 'add_to_collection'},
    {'items': [{'id': ' '}], 'action': 'delete'},
])
def test_invalid_batches_are_rejected(client, payload):
    assert client.post('/api/batch/items', json=payload).status_code == 422


def test_bulk_response_camel_case_contract(client, mocker):
    setup_db(mocker, [[{'id': 'p_1'}]])
    response = client.post('/api/batch/items', json={
        'items': [{'id': 'p_1', 'itemType': 'paper'}], 'action': 'status', 'status': 'read',
    })
    assert response.status_code == 200
    assert response.json() == {'succeededIds': ['p_1'], 'failed': []}


@pytest.mark.parametrize('service,method,update', [
    (paper_service, 'update_paper', PaperUpdate),
    (website_service, 'update_website', WebsiteUpdate),
    (github_repo_service, 'update_github_repo', GitHubRepoUpdate),
])
@pytest.mark.parametrize('found', [True, False])
def test_single_item_updates_use_returned_rows_without_extra_reads(mocker, service, method, update, found):
    row = dict(id='item', title='Title', status='read', authors=[], year=2026, venue='',
               source='human', created_at='2026-01-01', url='https://example.com', owner='owner', repo_name='repo')
    query = setup_db(mocker, [[row] if found else []])
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(service, 'get_client', return_value=db)
    result = getattr(service, method)('item', update(status='read'))
    assert (result.status if result else None) == ('read' if found else None)
    query.execute.assert_called_once()
    query.select.assert_not_called()
