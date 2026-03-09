from __future__ import annotations

from conftest import make_models


def _mock_db_query(mocker, rows):
    query = mocker.Mock()
    query.select.return_value = query
    query.eq.return_value = query
    query.execute.return_value = mocker.Mock(data=rows)
    client = mocker.Mock()
    client.table.return_value = query
    return client


def test_send_paper_chat_success(client, mocker):
    mocker.patch("app.chat.get_client", return_value=_mock_db_query(mocker, [{"title": "Paper", "abstract": "A", "pdf_url": None}]))
    assistant = mocker.Mock()
    assistant.model_dump.return_value = {"id": "m_1", "role": "assistant", "content": "answer"}
    mocker.patch("app.chat.chat_service.generate_response", return_value=assistant)

    response = client.post("/api/papers/p_1/chat", json={"content": "summarize"})

    assert response.status_code == 201
    assert response.json()["role"] == "assistant"


def test_extract_paper_text_branching(client, mocker):
    mocker.patch("app.chat.get_client", return_value=_mock_db_query(mocker, []))
    response = client.post("/api/papers/p_1/text")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Paper not found"}

    mocker.patch("app.chat.get_client", return_value=_mock_db_query(mocker, [{"pdf_url": None}]))
    response = client.post("/api/papers/p_1/text")
    assert response.status_code == 400
    assert response.json() == {"detail": "Paper has no PDF uploaded"}

    mocker.patch("app.chat.get_client", return_value=_mock_db_query(mocker, [{"pdf_url": "https://example.com/p.pdf"}]))
    mocker.patch(
        "app.chat.pdf_text_service.extract_and_cache",
        return_value={"page_count": 12, "extracted_at": "2026-03-09T00:00:00Z", "markdown": "content"},
    )
    response = client.post("/api/papers/p_1/text")
    assert response.status_code == 200
    assert response.json()["pageCount"] == 12
    assert response.json()["charCount"] == len("content")


def test_generate_notes_maps_service_errors(client, mocker):
    mocker.patch("app.notes.note_service.generate_notes", side_effect=ValueError("Paper not found"))
    response = client.post("/api/papers/p_1/notes/generate", json={"library_id": "lib_1"})
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Paper not found"}

    mocker.patch("app.notes.note_service.generate_notes", side_effect=RuntimeError("Model unavailable"))
    response = client.post("/api/papers/p_1/notes/generate", json={"library_id": "lib_1"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Model unavailable"}

    mocker.patch("app.notes.note_service.generate_notes", return_value=make_models([{"id": "n_1", "name": "Summary"}]))
    response = client.post("/api/papers/p_1/notes/generate", json={"library_id": "lib_1"})
    assert response.status_code == 201
    assert response.json()[0]["name"] == "Summary"


def test_proposal_batch_action_validation(client):
    response = client.post("/api/proposals/batch", json={"ids": ["pp_1"], "action": "archive"})
    assert response.status_code == 422
    assert response.json() == {"detail": "action must be 'approve' or 'reject'"}
