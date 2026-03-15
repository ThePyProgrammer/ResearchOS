"""Route-level tests for /api/projects and /api/projects/:id/notes endpoints.

Uses monkeypatching to avoid DB calls — tests only the HTTP layer.
"""
from __future__ import annotations

from conftest import make_models, DummyModel


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PROJECT_PAYLOAD = {
    "id": "proj_abc12345",
    "name": "Test Project",
    "description": None,
    "status": "active",
    "libraryId": "lib_1",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
}

_NOTE_PAYLOAD = {
    "id": "note_abc12345",
    "name": "Note 1",
    "type": "file",
    "content": "",
    "parentId": None,
    "projectId": "proj_1",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
}


# ---------------------------------------------------------------------------
# POST /api/projects — create
# ---------------------------------------------------------------------------

def test_create_project(client, mocker):
    mocker.patch(
        "app.projects.project_service.create_project",
        return_value=DummyModel(_PROJECT_PAYLOAD),
    )
    response = client.post("/api/projects", json={"name": "Test Project", "libraryId": "lib_1"})
    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "proj_abc12345"
    assert body["name"] == "Test Project"
    assert body["status"] == "active"
    assert body["libraryId"] == "lib_1"
    assert "createdAt" in body
    assert "updatedAt" in body


# ---------------------------------------------------------------------------
# GET /api/projects — list (filtered by library_id)
# ---------------------------------------------------------------------------

def test_list_projects_by_library(client, mocker):
    mock_list = mocker.patch(
        "app.projects.project_service.list_projects",
        return_value=make_models([_PROJECT_PAYLOAD]),
    )
    response = client.get("/api/projects?library_id=lib_1")
    assert response.status_code == 200
    mock_list.assert_called_once_with(library_id="lib_1")
    body = response.json()
    assert isinstance(body, list)
    assert body[0]["id"] == "proj_abc12345"


def test_list_projects_no_filter(client, mocker):
    mock_list = mocker.patch(
        "app.projects.project_service.list_projects",
        return_value=make_models([_PROJECT_PAYLOAD]),
    )
    response = client.get("/api/projects")
    assert response.status_code == 200
    mock_list.assert_called_once_with(library_id=None)


# ---------------------------------------------------------------------------
# GET /api/projects/:id — get single
# ---------------------------------------------------------------------------

def test_get_project(client, mocker):
    mocker.patch(
        "app.projects.project_service.get_project",
        return_value=DummyModel(_PROJECT_PAYLOAD),
    )
    response = client.get("/api/projects/proj_1")
    assert response.status_code == 200
    assert response.json()["id"] == "proj_abc12345"


def test_get_project_not_found(client, mocker):
    mocker.patch(
        "app.projects.project_service.get_project",
        return_value=None,
    )
    response = client.get("/api/projects/nonexistent")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Project not found"}


# ---------------------------------------------------------------------------
# PATCH /api/projects/:id — update (partial / exclude_unset)
# ---------------------------------------------------------------------------

def test_update_project_partial(client, mocker):
    updated_payload = {**_PROJECT_PAYLOAD, "name": "New Name"}
    mocker.patch(
        "app.projects.project_service.update_project",
        return_value=DummyModel(updated_payload),
    )
    response = client.patch("/api/projects/proj_1", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_update_project_not_found(client, mocker):
    mocker.patch(
        "app.projects.project_service.update_project",
        return_value=None,
    )
    response = client.patch("/api/projects/nonexistent", json={"name": "X"})
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Project not found"}


# ---------------------------------------------------------------------------
# DELETE /api/projects/:id — delete
# ---------------------------------------------------------------------------

def test_delete_project(client, mocker):
    mocker.patch(
        "app.projects.project_service.delete_project",
        return_value=True,
    )
    response = client.delete("/api/projects/proj_1")
    assert response.status_code == 204


def test_delete_project_not_found(client, mocker):
    mocker.patch(
        "app.projects.project_service.delete_project",
        return_value=False,
    )
    response = client.delete("/api/projects/nonexistent")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Project not found"}


# ---------------------------------------------------------------------------
# GET /api/projects/:id/notes — list project notes
# ---------------------------------------------------------------------------

def test_list_project_notes(client, mocker):
    mock_list = mocker.patch(
        "app.notes.note_service.list_notes",
        return_value=make_models([_NOTE_PAYLOAD]),
    )
    response = client.get("/api/projects/proj_1/notes")
    assert response.status_code == 200
    mock_list.assert_called_once_with(project_id="proj_1")
    body = response.json()
    assert isinstance(body, list)
    assert body[0]["name"] == "Note 1"


# ---------------------------------------------------------------------------
# POST /api/projects/:id/notes — create project note
# ---------------------------------------------------------------------------

def test_create_project_note(client, mocker):
    mocker.patch(
        "app.notes.note_service.create_note",
        return_value=DummyModel(_NOTE_PAYLOAD),
    )
    response = client.post("/api/projects/proj_1/notes", json={"name": "Note 1"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Note 1"
    assert body["projectId"] == "proj_1"
