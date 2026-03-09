def test_unhandled_exception_returns_sanitized_500(client, mocker):
    mocker.patch("app.libraries.library_service.list_libraries", side_effect=RuntimeError("boom"))

    response = client.get("/api/libraries")

    assert response.status_code == 500
    assert response.json() == {
        "error": "internal_server_error",
        "detail": "An unexpected error occurred.",
    }


def test_validation_error_shape_is_preserved(client):
    response = client.post("/api/papers/import", json={"identifier": "   "})

    assert response.status_code == 422
    assert response.json() == {"detail": "identifier must not be empty"}
