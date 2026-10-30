import json
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from models.canvas import validate_canvas
from models.note import Note, NoteCreate, NoteUpdate
from services import note_service


def node(**updates):
    return {"id": "n1", "type": "text", "x": 0, "y": 0, "width": 300, "height": 200, "text": "Hello", **updates}


def test_canvas_creation_defaults_and_extensions():
    data = NoteCreate(name="Map", type="canvas")
    assert data.name == "Map.canvas"
    assert json.loads(data.content) == {"nodes": [], "edges": []}
    content = json.dumps({"nodes": [node(researchos={"custom": True})], "edges": [], "vendor": {"future": 1}})
    assert NoteCreate(name="Map.canvas", type="canvas", content=content).content == content


@pytest.mark.parametrize("value", [None, [], {"nodes": None}, {"nodes": [node(), node()]}, {"nodes": [node(width=0)]}, {"nodes": [node(x=True)]}, {"nodes": [node(x=0.5)]}, {"nodes": [node(color="red")]}, {"nodes": [node(type="file", file="a.md", subpath="heading")]}, {"nodes": [node()], "edges": [{"id": "e", "fromNode": "n1", "toNode": "missing"}]}])
def test_invalid_canvas_is_rejected(value):
    with pytest.raises(ValueError):
        validate_canvas(json.dumps(value))


def test_optional_arrays_and_all_node_types():
    assert validate_canvas('{}') == '{}'
    data = {"nodes": [node(), node(id="f", type="file", file="Nested.canvas", subpath="#Heading"), node(id="l", type="link", url="https://example.com"), node(id="g", type="group", label="Group", background="image.png", backgroundStyle="ratio")], "edges": [{"id": "edge", "fromNode": "f", "toNode": "l", "fromSide": "bottom", "toSide": "top", "fromEnd": "arrow", "toEnd": "none", "color": "#123456", "label": "reference"}]}
    assert json.loads(validate_canvas(json.dumps(data))) == data


def test_canvas_create_api_rejects_bad_json_before_write(client, monkeypatch):
    create = Mock()
    monkeypatch.setattr(note_service, 'create_note', create)
    result = client.post('/api/libraries/lib/notes', json={"name": "Bad", "type": "canvas", "content": "invalid"})
    assert result.status_code == 422
    create.assert_not_called()


def test_update_rejects_invalid_content_before_database_write(monkeypatch):
    existing = Note(id="c", name="Map.canvas", type="canvas", content='{}', created_at="now", updated_at="now")
    monkeypatch.setattr(note_service, "get_note", lambda _: existing)
    db = Mock()
    monkeypatch.setattr(note_service, "get_client", lambda: db)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        note_service.update_note("c", NoteUpdate(content="<p>Accidental HTML overwrite</p>"))
    assert error.value.status_code == 422
    db.table.assert_not_called()


@pytest.mark.parametrize('scope,identifier', [('paper_id', 'paper'), ('website_id', 'site'), ('github_repo_id', 'repo'), ('library_id', 'library'), ('project_id', 'project'), ('experiment_id', 'experiment')])
def test_canvas_persists_in_every_notes_scope(monkeypatch, scope, identifier):
    db = Mock()
    monkeypatch.setattr(note_service, 'get_client', lambda: db)
    created = note_service.create_note(NoteCreate(name='Map', type='canvas', parent_id='folder'), **{scope: identifier})
    assert created.type == 'canvas'
    assert getattr(created, scope) == identifier
    saved = db.table.return_value.insert.call_args.args[0]
    assert saved['parent_id'] == 'folder'
    assert json.loads(saved['content']) == {'nodes': [], 'edges': []}


def test_existing_note_html_is_unchanged():
    assert NoteCreate(name='Note', content='<p>Hello</p>').content == '<p>Hello</p>'
    with pytest.raises(ValidationError):
        NoteCreate(name='Invalid', type='unknown')
