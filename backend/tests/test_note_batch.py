from types import SimpleNamespace

import pytest

from models.note_batch import NoteBatchRequest
from services import note_service


def note(note_id, **fields):
    return dict(id=note_id, name=note_id, type='file', content='<p>Content</p>',
                created_at='2026-01-01', updated_at='2026-01-01', **fields)


def database(mocker, pages):
    query = mocker.Mock()
    for name in ('select', 'in_', 'order', 'range'):
        getattr(query, name).return_value = query
    query.execute.side_effect = [SimpleNamespace(data=page) for page in pages]
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(note_service, 'get_client', return_value=db)
    return query


def test_100_paper_sources_use_one_query_and_return_empty_sources(mocker):
    query = database(mocker, [[note('n1', paper_id='p0')]])
    result = note_service.list_item_notes(NoteBatchRequest(items=[{'id': f'p{i}'} for i in range(100)]))
    assert len(result) == 100
    assert result[0].notes[0].content == '<p>Content</p>'
    assert all(not source.notes for source in result[1:])
    query.execute.assert_called_once()
    query.in_.assert_called_once_with('paper_id', [f'p{i}' for i in range(100)])


def test_batches_group_by_type_and_preserve_sort_order(mocker):
    query = database(mocker, [
        [note('z', paper_id='same'), {**note('folder', paper_id='same'), 'type': 'folder'},
         note('pinned', paper_id='same', is_pinned=True)],
        [note('web', website_id='same')], [note('repo', github_repo_id='gh1')],
    ])
    result = note_service.list_item_notes(NoteBatchRequest(items=[
        {'id': 'same'}, {'id': 'same', 'itemType': 'website'}, {'id': 'gh1', 'itemType': 'github_repo'},
    ]))
    assert [n.id for n in result[0].notes] == ['pinned', 'folder', 'z']
    assert result[1].notes[0].id == 'web'
    assert result[2].notes[0].id == 'repo'
    assert query.execute.call_count == 3


def test_batches_page_through_large_note_sets(mocker):
    query = database(mocker, [[note(f'n{i}', paper_id='p1') for i in range(500)], [note('last', paper_id='p1')]])
    result = note_service.list_item_notes(NoteBatchRequest(items=[{'id': 'p1'}]))
    assert len(result[0].notes) == 501
    assert [call.args for call in query.range.call_args_list] == [(0, 499), (500, 999)]


@pytest.mark.parametrize('items', [[], [{'id': 'p'}] * 101, [{'id': 'p'}, {'id': 'p'}], [{'id': 'p', 'itemType': 'bad'}]])
def test_batch_input_validation(client, items):
    assert client.post('/api/notes/batch', json={'items': items}).status_code == 422


def test_batch_contract_and_failures(client, mocker):
    database(mocker, [[note('n1', paper_id='p1')]])
    response = client.post('/api/notes/batch', json={'items': [{'id': 'p1'}]})
    assert response.status_code == 200
    assert response.json()[0]['itemType'] == 'paper'
    assert response.json()[0]['notes'][0]['paperId'] == 'p1'
    assert 'paper_id' not in response.text
    mocker.patch.object(note_service, 'list_item_notes', side_effect=RuntimeError('private details'))
    response = client.post('/api/notes/batch', json={'items': [{'id': 'p1'}]})
    assert response.status_code == 500
    assert response.json() == {'error': 'internal_server_error', 'detail': 'An unexpected error occurred.'}
