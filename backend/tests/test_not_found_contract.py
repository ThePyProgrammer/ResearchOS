import pytest


@pytest.mark.parametrize(
    ("method", "path", "patch_target", "body", "expected_detail"),
    [
        ("get", "/api/papers/missing", "app.papers.paper_service.get_paper", None, "Paper not found"),
        ("get", "/api/websites/missing", "app.websites.website_service.get_website", None, "Website not found"),
        ("get", "/api/collections/missing", "app.collections.collection_service.get_collection", None, "Collection not found"),
        ("get", "/api/workflows/missing", "app.workflows.workflow_service.get_workflow", None, "Workflow not found"),
        ("get", "/api/runs/missing", "app.runs.run_service.get_run", None, "Run not found"),
        ("post", "/api/proposals/missing/approve", "app.proposals.proposal_service.approve_proposal", None, "Proposal not found"),
        ("patch", "/api/libraries/missing", "app.libraries.library_service.update_library", {}, "Library not found"),
        ("patch", "/api/notes/missing", "app.notes.note_service.update_note", {"title": "x"}, "Note not found"),
        ("post", "/api/papers/missing/chat", "app.chat.get_client", {"content": "hello"}, "Paper not found"),
    ],
)
def test_404_responses_use_standard_error_shape(
    client,
    mocker,
    method,
    path,
    patch_target,
    body,
    expected_detail,
):
    if patch_target == "app.chat.get_client":
        fake_query = mocker.Mock()
        fake_query.select.return_value = fake_query
        fake_query.eq.return_value = fake_query
        fake_query.execute.return_value = mocker.Mock(data=[])
        fake_client = mocker.Mock()
        fake_client.table.return_value = fake_query
        mocker.patch("app.chat.get_client", return_value=fake_client)
    else:
        mocker.patch(patch_target, return_value=None)

    kwargs = {"json": body} if body is not None else {}
    response = getattr(client, method)(path, **kwargs)

    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": expected_detail}
