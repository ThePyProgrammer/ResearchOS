from types import SimpleNamespace

import pytest
import httpx
from postgrest import SyncPostgrestClient
from postgrest.exceptions import APIError

from models.lab import LabDetail, LabCreate, LabMemberPage, LabPaperPage, LabUpdate
from services import lab_service


LAB = {"id": "lab_1", "name": "Language Lab", "description": None, "created_at": "2026-10-07"}
PAPER = {"id": "p_1", "title": "Shared work", "authors": ["Jane", "John"], "year": 2026,
         "venue": "ICLR", "status": "read", "library_id": "lib_1", "library_name": "Research"}


def test_create_and_update_contracts(client, mocker):
    create = mocker.patch.object(lab_service, "create_lab", return_value=LabDetail.model_validate(LAB))
    response = client.post("/api/labs", json={"name": " Language Lab "})
    assert response.status_code == 201
    assert response.json() == {"id": "lab_1", "name": "Language Lab", "description": None, "createdAt": "2026-10-07", "websites": [], "principalInvestigators": []}
    assert create.call_args.args[0].name == "Language Lab"
    update = mocker.patch.object(lab_service, "update_lab", return_value=LabDetail.model_validate(LAB))
    assert client.patch("/api/labs/lab_1", json={"description": None}).status_code == 200
    assert update.call_args.args[1].model_dump(exclude_unset=True) == {"description": None}


@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/labs", {"name": "  "}),
    ("post", "/api/labs", {"name": "a" * 201}),
    ("patch", "/api/labs/lab_1", {"name": None}),
    ("patch", "/api/labs/lab_1", {"name": " "}),
    ("get", "/api/labs?limit=101", None),
    ("get", "/api/labs?offset=-1", None),
    ("get", "/api/labs/lab_1/papers?limit=0", None),
    ("get", "/api/labs/lab_1/members?offset=-1", None),
    ("get", "/api/labs/lab_1/member-options?search=", None),
])
def test_invalid_inputs(client, method, path, payload):
    assert client.request(method, path, json=payload).status_code == 422


@pytest.mark.parametrize("method,path,function", [
    ("get", "/api/labs/missing", "get_lab"),
    ("patch", "/api/labs/missing", "update_lab"),
    ("delete", "/api/labs/missing", "delete_lab"),
    ("get", "/api/labs/missing/members", "list_members"),
    ("get", "/api/labs/missing/papers", "list_papers"),
    ("get", "/api/labs/missing/member-options?search=Jane", "member_options"),
    ("put", "/api/labs/missing/members/auth_1", "add_member"),
    ("delete", "/api/labs/missing/members/auth_1", "remove_member"),
])
def test_missing_lab_error_shape(client, mocker, method, path, function):
    mocker.patch.object(lab_service, function, return_value=None)
    response = client.request(method, path, json={} if method == "patch" else None)
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Lab not found"}


def test_papers_contract_and_pagination(client, mocker):
    service = mocker.patch.object(lab_service, "list_papers", return_value=LabPaperPage(
        items=[PAPER], total=1001, limit=25, offset=1000,
    ))
    response = client.get("/api/labs/lab_1/papers?offset=1000&search=Shared")
    assert response.status_code == 200
    assert response.json()["total"] == 1001
    assert response.json()["items"][0]["libraryName"] == "Research"
    assert "library_id" not in response.text
    service.assert_called_once_with("lab_1", search="Shared", limit=25, offset=1000)


def test_unexpected_database_error_does_not_leak(client, mocker):
    mocker.patch.object(lab_service, "get_lab", side_effect=RuntimeError("private database detail"))
    response = client.get("/api/labs/lab_1")
    assert response.status_code == 500
    assert response.json() == {"error": "internal_server_error", "detail": "An unexpected error occurred."}


@pytest.fixture
def database(mocker):
    query = mocker.Mock()
    for name in ("select", "eq", "order", "range", "ilike", "insert", "update", "delete", "upsert"):
        getattr(query, name).return_value = query
    query.execute.return_value = SimpleNamespace(data=[LAB], count=1)
    db = mocker.Mock()
    db.table.return_value = query
    db.rpc.return_value = query
    mocker.patch.object(lab_service, "get_client", return_value=db)
    return db, query


@pytest.mark.parametrize("function,rpc,model", [
    ("list_papers", "get_lab_selected_papers_page", LabPaperPage),
    ("list_members", "get_lab_members_page", LabMemberPage),
])
def test_page_reads_use_one_round_trip_including_empty_and_missing(database, function, rpc, model):
    db, query = database
    payload = {"items": [], "total": 1500, "limit": 25, "offset": 1600}
    query.execute.return_value.data = payload
    page = getattr(lab_service, function)("lab_1", limit=25, offset=1600)
    assert isinstance(page, model)
    assert page.total == 1500 and page.items == []
    assert db.rpc.call_args.args[0] == rpc
    assert db.rpc.call_args.args[1]["p_offset"] == 1600
    query.execute.assert_called_once()
    db.table.assert_not_called()
    query.execute.return_value.data = None
    assert getattr(lab_service, function)("missing") is None


def test_lab_list_has_database_search_count_and_stable_pagination(database):
    db, query = database
    result = lab_service.list_labs(search="50%_lab", limit=30, offset=30)
    assert result.total == 1
    query.select.assert_called_once_with("*", count="exact")
    query.ilike.assert_called_once_with("name", "%50\\%\\_lab%")
    query.range.assert_called_once_with(30, 59)
    assert [call.args for call in query.order.call_args_list] == [("name",), ("id",)]
    query.execute.assert_called_once()


def test_writes_do_not_read_back_or_chain_select(database):
    db, query = database
    query.execute.return_value.data = {**LAB, "name": "Test"}
    lab = lab_service.create_lab(LabCreate(name=" Test "))
    assert lab.name == "Test"
    query.execute.assert_called_once()
    query.select.assert_not_called()
    query.reset_mock()
    assert lab_service.update_lab("lab_1", LabUpdate(description=None)).id == "lab_1"
    assert db.rpc.call_args.args == ("save_lab_details", {"p_lab_id": "lab_1", "p_data": {"description": None}, "p_created_at": None})
    query.execute.assert_called_once()
    query.select.assert_not_called()
    query.reset_mock()
    assert lab_service.delete_lab("lab_1")
    query.execute.assert_called_once()
    query.select.assert_not_called()


def test_add_member_uses_one_rpc_without_reading_or_adding_papers(database):
    db, query = database
    query.execute.return_value.data = {"author_id": "auth_1", "name": "Jane", "orcid": None}
    member = lab_service.add_member("lab_1", "auth_1")
    assert member.author_id == "auth_1"
    db.rpc.assert_called_once_with("add_lab_member_only", {"p_lab_id": "lab_1", "p_author_id": "auth_1"})
    query.execute.assert_called_once()
    db.table.assert_not_called()


def test_unknown_author_error(database, client):
    db, query = database
    query.execute.side_effect = APIError({"code": "P0002", "message": "Author not found", "details": None, "hint": None})
    response = client.put("/api/labs/lab_1/members/unknown")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Author not found"}
    db.table.assert_not_called()


def test_member_removal_uses_one_rpc_without_touching_papers(database):
    db, query = database
    query.execute.return_value.data = True
    assert lab_service.remove_member("lab_1", "auth_1")
    db.rpc.assert_called_once_with("remove_lab_member_only", {"p_lab_id": "lab_1", "p_author_id": "auth_1"})
    db.table.assert_not_called()


@pytest.mark.parametrize("resource,view,rpc,row", [
    ("members", "lab_member_details", "get_lab_members_page", {"author_id": "auth_1", "name": "Jane", "orcid": None}),
    ("papers", "lab_selected_papers", "get_lab_selected_papers_page", PAPER),
])
@pytest.mark.parametrize("total,offset,lab_exists", [(1, 0, True), (1105, 1200, True), (0, 0, True), (0, 0, False)])
def test_missing_rpc_falls_back_through_real_postgrest_client(
    client, mocker, caplog, resource, view, rpc, row, total, offset, lab_exists,
):
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.path == f"/rpc/{rpc}":
            return httpx.Response(404, json={
                "code": "PGRST202", "message": "Function missing from schema cache", "details": None, "hint": None,
            })
        if request.url.path == f"/{view}":
            assert request.url.params["lab_id"] == "eq.lab_1"
            assert request.url.params["offset"] == str(offset)
            assert request.url.params["limit"] == "25"
            assert request.headers["prefer"] == "count=exact"
            if resource == "papers":
                assert request.url.params["title"] == "ilike.%50\\%\\_lab%"
                assert request.url.params["order"] == "year.desc,id.asc"
            else:
                assert request.url.params["order"] == "name.asc,author_id.asc"
            rows = [row] if total and offset == 0 else []
            return httpx.Response(200, json=rows, headers={"content-range": f"0-0/{total}"})
        assert request.url.path == "/lab_details"
        return httpx.Response(200, json=[LAB] if lab_exists else [])

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        postgrest = SyncPostgrestClient("http://database.test", http_client=http)
        mocker.patch.object(lab_service, "get_client", return_value=SimpleNamespace(
            rpc=postgrest.rpc, table=postgrest.from_,
        ))
        response = client.get(f"/api/labs/lab_1/{resource}", params={
            "limit": 25, "offset": offset, "search": "50%_lab",
        })

    assert len(requests) == (2 if total else 3)
    assert ("025_lab_page_functions.sql" if resource == "members" else "026_explicit_lab_papers.sql") in caplog.text
    if not lab_exists:
        assert response.status_code == 404
        assert response.json() == {"error": "not_found", "detail": "Lab not found"}
    else:
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == total
        assert payload["offset"] == offset
        assert len(payload["items"]) == (1 if total and offset == 0 else 0)
        if payload["items"]:
            assert not any("_" in key for key in payload["items"][0])


@pytest.mark.parametrize("function", ["list_members", "list_papers"])
def test_rpc_fallback_does_not_hide_other_database_errors(database, function):
    db, query = database
    error = APIError({"code": "42501", "message": "Permission denied", "details": None, "hint": None})
    query.execute.side_effect = error
    with pytest.raises(APIError) as caught:
        getattr(lab_service, function)("lab_1")
    assert caught.value is error
    db.table.assert_not_called()


@pytest.mark.parametrize("payload", [{"paperIds": []}, {"paperIds": ["p"] * 101}, {"paperIds": [""]}, {"paperIds": [None]}, {"paperIds": ["p"], "authorId": ""}])
def test_invalid_paper_selections_never_reach_database(client, database, payload):
    db, _ = database
    assert client.post("/api/labs/lab_1/papers", json=payload).status_code == 422
    db.rpc.assert_not_called()


@pytest.mark.parametrize("author_id", [None, "auth_1"])
def test_selected_papers_are_added_in_one_atomic_batch(client, database, author_id):
    db, query = database
    query.execute.return_value.data = {"added_count": 2}
    response = client.post("/api/labs/lab_1/papers", json={"paperIds": ["p_1", "p_2", "p_1"], "authorId": author_id})
    assert response.status_code == 200
    assert response.json() == {"addedCount": 2}
    db.rpc.assert_called_once_with("add_lab_papers", {
        "p_lab_id": "lab_1", "p_paper_ids": ["p_1", "p_2"], "p_author_id": author_id,
    })
    query.execute.assert_called_once()
    db.table.assert_not_called()


def test_paper_options_are_scoped_paginated_and_counted_in_one_call(client, database):
    db, query = database
    query.execute.return_value.data = {"items": [PAPER], "total": 1105, "limit": 25, "offset": 1000}
    response = client.get("/api/labs/lab_1/paper-options?author_id=auth_1&search=Shared&offset=1000")
    assert response.status_code == 200
    assert response.json()["items"][0]["libraryName"] == "Research"
    db.rpc.assert_called_once_with("get_lab_paper_options", {
        "p_lab_id": "lab_1", "p_search": "Shared", "p_author_id": "auth_1", "p_limit": 25, "p_offset": 1000,
    })
    query.execute.assert_called_once()


@pytest.mark.parametrize("method,path,payload", [
    ("put", "/api/labs/lab_1/members/auth_1", None),
    ("delete", "/api/labs/lab_1/members/auth_1", None),
    ("get", "/api/labs/lab_1/paper-options", None),
    ("post", "/api/labs/lab_1/papers", {"paperIds": ["p_1"]}),
])
def test_unmigrated_mutations_and_picker_fail_with_actionable_error(client, database, method, path, payload):
    db, query = database
    query.execute.side_effect = APIError({"code": "PGRST202", "message": "Missing function", "details": None, "hint": None})
    response = client.request(method, path, json=payload)
    assert response.status_code == 503
    assert "026_explicit_lab_papers.sql" in response.json()["detail"]
    db.table.assert_not_called()


def test_unmigrated_paper_reads_never_return_automatically_derived_papers(client, database):
    db, query = database
    query.execute.side_effect = [
        APIError({"code": "PGRST202", "message": "Missing RPC", "details": None, "hint": None}),
        APIError({"code": "PGRST205", "message": "Missing view", "details": None, "hint": None}),
    ]
    response = client.get("/api/labs/lab_1/papers")
    assert response.status_code == 503
    assert "026_explicit_lab_papers.sql" in response.json()["detail"]
    db.table.assert_called_once_with("lab_selected_papers")


@pytest.mark.parametrize("code,status", [("P0002", 404), ("22023", 422), ("42501", 500)])
def test_invalid_batch_errors_are_sanitized(client, database, code, status):
    _, query = database
    query.execute.side_effect = APIError({"code": code, "message": "private database details", "details": None, "hint": None})
    response = client.post("/api/labs/lab_1/papers", json={"paperIds": ["p_1"]})
    assert response.status_code == status
    assert "private database details" not in response.text


def test_unlinking_paper_preserves_source_and_member_records(client, database, mocker):
    db, query = database
    mocker.patch.object(lab_service, "get_lab", return_value=LabDetail.model_validate(LAB))
    response = client.delete("/api/labs/lab_1/papers/p_1")
    assert response.status_code == 204
    db.table.assert_called_once_with("lab_paper_links")
    assert [call.args for call in query.eq.call_args_list] == [("lab_id", "lab_1"), ("paper_id", "p_1")]


@pytest.mark.parametrize("payload", [
    {"websites": ["javascript:alert(1)"]}, {"websites": ["ftp://example.org"]},
    {"websites": ["https://user:password@example.org"]}, {"websites": ["not a URL"]},
    {"websites": None}, {"websites": ["https://example.org"] * 21},
    {"piAuthorIds": None}, {"piAuthorIds": [""]}, {"piAuthorIds": ["a"] * 51},
])
def test_invalid_lab_details_do_not_reach_database(client, database, payload):
    db, _ = database
    assert client.patch("/api/labs/lab_1", json=payload).status_code == 422
    db.rpc.assert_not_called()
    db.table.assert_not_called()


def test_lab_detail_read_includes_pis_in_one_query(client, database):
    db, query = database
    query.execute.return_value.data = [{**LAB, "websites": ["https://example.org/"],
        "principal_investigators": [{"author_id": "a_1", "name": "Jane", "orcid": None}]}]
    response = client.get("/api/labs/lab_1")
    assert response.status_code == 200
    assert response.json()["principalInvestigators"][0]["authorId"] == "a_1"
    assert response.json()["websites"] == ["https://example.org/"]
    db.table.assert_called_once_with("lab_details")
    query.execute.assert_called_once()


def test_detail_save_is_atomic_and_clear_is_explicit(client, database):
    db, query = database
    query.execute.return_value.data = LAB
    response = client.patch("/api/labs/lab_1", json={"websites": [" https://example.org "], "piAuthorIds": ["a_1", "a_2"]})
    assert response.status_code == 200
    assert db.rpc.call_args.args[1]["p_data"] == {"websites": ["https://example.org/"], "pi_author_ids": ["a_1", "a_2"]}
    query.execute.assert_called_once()
    db.table.assert_not_called()
    client.patch("/api/labs/lab_1", json={"piAuthorIds": [], "websites": []})
    assert db.rpc.call_args.args[1]["p_data"] == {"pi_author_ids": [], "websites": []}


def test_pi_options_are_bounded_and_do_not_load_papers(client, database):
    db, query = database
    query.execute.return_value.data = [{"author_id": "a_1", "name": "Jane", "orcid": None}]
    response = client.get("/api/labs/pi-options?search=50%25_&limit=20")
    assert response.status_code == 200
    assert response.json()[0]["authorId"] == "a_1"
    db.table.assert_called_once_with("authors")
    query.select.assert_called_once_with("author_id:id,name,orcid")
    query.ilike.assert_called_once_with("name", "%50\\%\\_%")
    query.range.assert_called_once_with(0, 19)
    query.execute.assert_called_once()


@pytest.mark.parametrize("code,status", [("P0002", 404), ("23503", 404), ("PGRST202", 503), ("22023", 422), ("42501", 500)])
def test_lab_detail_save_errors(client, database, code, status):
    _, query = database
    query.execute.side_effect = APIError({"code": code, "message": "private database details", "details": None, "hint": None})
    response = client.patch("/api/labs/lab_1", json={"piAuthorIds": ["a_1"]})
    assert response.status_code == status
    assert "private database details" not in response.text
    if status == 503:
        assert "027_lab_details.sql" in response.text


@pytest.mark.parametrize("pi_ids,total,offset", [(["pi_1"], 51, 50), (["pi_1"], 0, 0), ([], 1, 0)])
def test_filtered_members_count_and_paginate_in_database(client, mocker, pi_ids, total, offset):
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.path == "/lab_details":
            return httpx.Response(200, json=[{**LAB, "principal_investigators": [
                {"author_id": author_id, "name": "PI"} for author_id in pi_ids
            ]}])
        assert request.url.path == "/lab_member_details"
        assert request.url.params["lab_id"] == "eq.lab_1"
        assert request.url.params["offset"] == str(offset)
        assert request.url.params["limit"] == "50"
        assert request.url.params["order"] == "name.asc,author_id.asc"
        assert request.headers["prefer"] == "count=exact"
        if pi_ids:
            assert request.url.params["author_id"] == "not.in.(pi_1)"
        else:
            assert "author_id" not in request.url.params
        return httpx.Response(200, json=[{"author_id": "member_1", "name": "Member"}] if total else [],
                              headers={"content-range": f"0-0/{total}"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        postgrest = SyncPostgrestClient("http://database.test", http_client=http)
        mocker.patch.object(lab_service, "get_client", return_value=SimpleNamespace(
            rpc=postgrest.rpc, table=postgrest.from_,
        ))
        response = client.get("/api/labs/lab_1/members", params={"excludePis": "true", "offset": offset})
    assert response.status_code == 200
    assert response.json()["total"] == total
    assert response.json()["offset"] == offset
    assert len(requests) == 2
    assert all(request.method == "GET" for request in requests)


def test_filtered_members_missing_lab(client, mocker):
    mocker.patch.object(lab_service, "get_lab", return_value=None)
    response = client.get("/api/labs/missing/members?excludePis=true")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Lab not found"}


def test_lab_directory_returns_pi_bylines_in_one_query(client, database):
    db, query = database
    query.execute.return_value.data = [{**LAB, "principal_investigators": [
        {"author_id": "pi_1", "name": "Ada Smith", "orcid": None},
        {"author_id": "pi_2", "name": "Bea Smith", "orcid": None},
    ]}]
    response = client.get("/api/labs")
    assert response.status_code == 200
    assert response.json()["items"][0]["principalInvestigators"] == [
        {"authorId": "pi_1", "name": "Ada Smith", "orcid": None},
        {"authorId": "pi_2", "name": "Bea Smith", "orcid": None},
    ]
    db.table.assert_called_once_with("lab_details")
    query.execute.assert_called_once()
    db.rpc.assert_not_called()
