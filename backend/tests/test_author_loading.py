from types import SimpleNamespace

from services import author_service


def author(aid):
    return dict(id=aid, name=aid, name_normalized=aid, created_at="2026-01-01")


def database(mocker, pages):
    query = mocker.Mock()
    for method in ("select", "in_", "order", "range", "limit", "eq", "ilike"):
        getattr(query, method).return_value = query
    query.execute.side_effect = [SimpleNamespace(data=page) for page in pages]
    db = mocker.Mock()
    db.table.return_value = query
    mocker.patch.object(author_service, "get_client", return_value=db)
    return query


def test_listing_scopes_enrichment_and_pages_all_counts(mocker):
    library = {"id": "lib1", "name": "Library"}
    link = {"author_id": "a1", "papers": {"library_id": "lib1"}}
    query = database(mocker, [[author("a1"), author("a2")], [link] * 500, [link], [library], [], []])
    result = author_service.list_authors()
    assert [a.paper_count for a in result] == [501, 0]
    assert result[0].libraries[0].name == "Library"
    assert len(result[0].libraries) == 1
    assert result[1].libraries == []
    assert query.execute.call_count == 6
    assert [c.args for c in query.in_.call_args_list] == [("author_id", ["a1", "a2"])] * 2 + [("id", ["lib1"])] + [("author_id", ["a1", "a2"])] * 2
    assert [c.args for c in query.range.call_args_list] == [(0, 499), (500, 999), (0, 499), (0, 499), (0, 499)]


def test_empty_list_does_not_enrich(mocker):
    query = database(mocker, [[]])
    assert author_service.list_authors() == []
    query.execute.assert_called_once()


def test_paper_references_batch_profiles_and_preserve_positions(mocker):
    links = [dict(id=f"link{i}", paper_id="p1", author_id=f"a{i}", position=9-i,
                  raw_name=f"Name {i}", created_at="2026-01-01") for i in range(10)]
    query = database(mocker, [links, [author(f"a{i}") for i in range(10)],
                              [{"author_id": f"a{i}", "papers": None} for i in range(10)]])
    result = author_service.get_paper_author_links("p1")
    assert [r.link.position for r in result] == list(range(10))
    assert all(r.author.paper_count == 1 for r in result)
    assert result[0].model_dump(by_alias=True)["link"]["rawName"] == "Name 9"
    assert query.execute.call_count == 3


def test_author_papers_batch_and_skip_missing(mocker):
    paper = dict(id="p2", title="Paper", authors=[], year=2026, venue="", status="inbox",
                 source="human", created_at="2026-01-01")
    query = database(mocker, [[{"paper_id": "p1"}, {"paper_id": "p2"}], [paper]])
    assert [p.id for p in author_service.get_author_papers("a1")] == ["p2"]
    assert query.execute.call_count == 2
    assert query.in_.call_args.args == ("id", ["p1", "p2"])


def test_search_scopes_counts(mocker):
    query = database(mocker, [[author("a1")], [{"author_id": "a1"}]])
    assert author_service.search_authors("a1")[0].paper_count == 1
    query.in_.assert_called_once_with("author_id", ["a1"])


def test_id_batches_are_bounded(mocker):
    query = database(mocker, [[], [], []])
    author_service._read_related("authors", "*", "id", [str(i) for i in range(201)])
    assert [len(c.args[1]) for c in query.in_.call_args_list] == [100, 100, 1]


def test_paper_reference_route_preserves_contract(client, mocker):
    from models.author import Author, PaperAuthor, PaperAuthorReference
    mocker.patch("routers.papers.paper_service.get_paper", return_value=object())
    reference = PaperAuthorReference(
        link=PaperAuthor(id="l1", paper_id="p1", author_id="a1", created_at="2026-01-01"),
        author=Author.model_validate(author("a1")),
    )
    mocker.patch.object(author_service, "get_paper_author_links", return_value=[reference])
    response = client.get("/api/papers/p1/authors")
    assert response.status_code == 200
    assert response.json() == [reference.model_dump(by_alias=True)]


def test_labs_merge_roles_and_sort_without_per_author_queries(mocker):
    member_links = [
        {"author_id": "a1", "labs": {"id": "z", "name": "Zeta"}},
        {"author_id": "a1", "labs": {"id": "a", "name": "Alpha"}},
    ]
    pi_links = [
        {"author_id": "a1", "labs": {"id": "z", "name": "Zeta"}},
        {"author_id": "a2", "labs": {"id": "a", "name": "Alpha"}},
    ]
    query = database(mocker, [[author("a1"), author("a2"), author("a3")], [], member_links, pi_links])
    result = author_service.list_authors()
    assert [(lab.id, lab.is_member, lab.is_pi) for lab in result[0].labs] == [("a", True, False), ("z", True, True)]
    assert [(lab.id, lab.is_member, lab.is_pi) for lab in result[1].labs] == [("a", False, True)]
    assert result[2].labs == []
    assert query.execute.call_count == 4
    assert query.select.call_args_list[-1].args == ("author_id,labs(id,name)",)
    assert [c.args for c in query.in_.call_args_list] == [("author_id", ["a1", "a2", "a3"])] * 3


def test_profile_route_includes_current_lab_names_and_roles(client, mocker):
    query = database(mocker, [[author("a1")], [], [], [{"author_id": "a1", "labs": {"id": "l1", "name": "Renamed lab"}}]])
    response = client.get("/api/authors/a1")
    assert response.status_code == 200
    assert response.json()["labs"] == [{"id": "l1", "name": "Renamed lab", "isMember": False, "isPi": True}]
    assert query.execute.call_count == 4


def test_author_lab_reads_page_relationships_and_bound_ids(mocker):
    links = [{"author_id": "a1", "labs": {"id": str(i), "name": f"Lab {i}"}} for i in range(501)]
    query = database(mocker, [links[:500], links[500:], [links[0]]])
    result = author_service._read_author_labs(["a1"])
    assert len(result["a1"]) == 501
    assert next(lab for lab in result["a1"] if lab.id == "0").is_pi
    assert [c.args for c in query.range.call_args_list] == [(0, 499), (500, 999), (0, 499)]
    query = database(mocker, [[], [], [], [], [], []])
    assert author_service._read_author_labs([str(i) for i in range(201)]) == {}
    assert [len(c.args[1]) for c in query.in_.call_args_list] == [100, 100, 1, 100, 100, 1]


def test_missing_lab_schema_is_actionable_and_other_errors_propagate(mocker):
    import pytest
    from fastapi import HTTPException
    from postgrest.exceptions import APIError
    query = database(mocker, [])
    query.execute.side_effect = APIError({"code": "PGRST205", "message": "Missing table", "details": None, "hint": None})
    with pytest.raises(HTTPException) as caught:
        author_service._read_author_labs(["a1"])
    assert caught.value.status_code == 503
    assert "027_lab_details.sql" in caught.value.detail
    error = APIError({"code": "42501", "message": "Permission denied", "details": None, "hint": None})
    query.execute.side_effect = error
    with pytest.raises(APIError) as caught:
        author_service._read_author_labs(["a1"])
    assert caught.value is error
