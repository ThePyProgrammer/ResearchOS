from __future__ import annotations

from conftest import make_models


def test_export_bibtex_returns_download(client, mocker):
    mocker.patch(
        "app.papers.paper_service.list_papers",
        return_value=make_models([{"id": "p_1", "title": "Transformer"}]),
    )
    mocker.patch("services.website_service.list_websites", return_value=[])
    mocker.patch("services.bibtex_service.export_bibtex", return_value="@article{p_1,title={Transformer}}\n")

    response = client.get("/api/papers/export-bibtex")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-bibtex")
    assert 'attachment; filename="researchos-export.bib"' == response.headers["content-disposition"]
    assert "@article{p_1" in response.text


def test_export_bibtex_returns_not_found_for_empty_selection(client, mocker):
    mocker.patch("app.papers.paper_service.list_papers", return_value=[])
    mocker.patch("services.website_service.list_websites", return_value=[])

    response = client.get("/api/papers/export-bibtex")

    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "No items to export"}


def test_create_paper_duplicate_check_returns_409(client, mocker):
    mocker.patch("services.dedup_service.find_duplicates", return_value=[mocker.Mock(to_dict=lambda: {"id": "p_1", "matchField": "doi"})])

    response = client.post(
        "/api/papers?check_duplicates=true",
        json={
            "title": "Attention Is All You Need",
            "authors": ["A. Vaswani"],
            "year": 2017,
            "venue": "NeurIPS",
            "doi": "10.1000/test",
        },
    )

    assert response.status_code == 409
    payload = response.json()
    assert payload["duplicates"][0]["matchField"] == "doi"
    assert payload["paper"]["title"] == "Attention Is All You Need"


def test_import_paper_returns_existing_with_duplicates(client, mocker):
    existing = mocker.Mock()
    existing.model_dump.return_value = {"id": "p_1", "title": "Transformer"}
    dup = mocker.Mock()
    dup.paper = existing
    dup.to_dict.return_value = {"id": "p_1", "matchField": "title", "confidence": "likely"}

    mocker.patch(
        "services.import_service.resolve_identifier",
        return_value={
            "title": "Attention Is All You Need",
            "authors": ["A. Vaswani"],
            "year": 2017,
            "venue": "NeurIPS",
            "doi": "10.1000/test",
            "arxiv_id": None,
            "abstract": None,
            "pdf_url": None,
            "published_date": "2017-01-01",
        },
    )
    mocker.patch("services.dedup_service.find_duplicates", return_value=[dup])

    response = client.post("/api/papers/import", json={"identifier": "10.1000/test"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["already_exists"] is True
    assert payload["duplicates"][0]["matchField"] == "title"
    assert payload["id"] == "p_1"


def test_fetch_pdf_validation_errors(client, mocker):
    mocker.patch("app.papers.paper_service.get_paper", return_value=mocker.Mock(pdf_url=None))
    response = client.post("/api/papers/p_1/pdf/fetch")
    assert response.status_code == 422
    assert response.json() == {"detail": "Paper has no PDF URL to fetch from"}

    mocker.patch(
        "app.papers.paper_service.get_paper",
        return_value=mocker.Mock(pdf_url="https://x.supabase.co/storage/v1/object/public/pdfs/p_1.pdf"),
    )
    response = client.post("/api/papers/p_1/pdf/fetch")
    assert response.status_code == 422
    assert response.json() == {"detail": "PDF is already in storage"}
