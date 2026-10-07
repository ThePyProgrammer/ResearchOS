from types import SimpleNamespace

import pytest
import httpx
from postgrest import SyncPostgrestClient
from postgrest.exceptions import APIError

from models.lab import Lab, LabCreate, LabMemberPage, LabPaperPage, LabUpdate
from services import lab_service


LAB = {"id": "lab_1", "name": "Language Lab", "description": None, "created_at": "2026-10-07"}
PAPER = {"id": "p_1", "title": "Shared work", "authors": ["Jane", "John"], "year": 2026,
         "venue": "ICLR", "status": "read", "library_id": "lib_1", "library_name": "Research"}


def test_create_and_update_contracts(client, mocker):
    create = mocker.patch.object(lab_service, "create_lab", return_value=Lab.model_validate(LAB))
    response = client.post("/api/labs", json={"name": " Language Lab "})
    assert response.status_code == 201
    assert response.json() == {"id": "lab_1", "name": "Language Lab", "description": None, "createdAt": "2026-10-07"}
    assert create.call_args.args[0].name == "Language Lab"
    update = mocker.patch.object(lab_service, "update_lab", return_value=Lab.model_validate(LAB))
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
    ("list_papers", "get_lab_papers_page", LabPaperPage),
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
    lab = lab_service.create_lab(LabCreate(name=" Test "))
    assert lab.name == "Test"
    query.execute.assert_called_once()
    query.select.assert_not_called()
    query.reset_mock()
    assert lab_service.update_lab("lab_1", LabUpdate(description=None)).id == "lab_1"
    query.update.assert_called_once_with({"description": None})
    query.execute.assert_called_once()
    query.select.assert_not_called()
    query.reset_mock()
    assert lab_service.delete_lab("lab_1")
    query.execute.assert_called_once()
    query.select.assert_not_called()


def test_add_is_idempotent_and_does_not_load_author_papers(database, mocker):
    db, query = database
    mocker.patch.object(lab_service, "get_lab", return_value=Lab.model_validate(LAB))
    query.execute.return_value.data = [{"id": "auth_1", "name": "Jane", "orcid": None}]
    member = lab_service.add_member("lab_1", "auth_1")
    assert member.author_id == "auth_1"
    query.upsert.assert_called_once_with({"lab_id": "lab_1", "author_id": "auth_1"},
                                         on_conflict="lab_id,author_id", ignore_duplicates=True)
    assert [call.args[0] for call in db.table.call_args_list] == ["authors", "lab_members"]


def test_unknown_author_and_concurrent_deletion(database, mocker, client):
    db, query = database
    mocker.patch.object(lab_service, "get_lab", return_value=Lab.model_validate(LAB))
    query.execute.return_value.data = []
    response = client.put("/api/labs/lab_1/members/unknown")
    assert response.status_code == 404
    assert response.json() == {"error": "not_found", "detail": "Author not found"}
    query.upsert.assert_not_called()
    query.execute.side_effect = [
        SimpleNamespace(data=[{"id": "auth_1", "name": "Jane"}]),
        APIError({"code": "23503", "message": "foreign key", "details": "private", "hint": None}),
    ]
    response = client.put("/api/labs/lab_1/members/auth_1")
    assert response.status_code == 404
    assert response.json()["error"] == "not_found"


def test_member_removal_only_deletes_relationship(database, mocker):
    db, query = database
    mocker.patch.object(lab_service, "get_lab", return_value=Lab.model_validate(LAB))
    assert lab_service.remove_member("lab_1", "auth_1")
    db.table.assert_called_once_with("lab_members")
    assert [call.args for call in query.eq.call_args_list] == [("lab_id", "lab_1"), ("author_id", "auth_1")]


@pytest.mark.parametrize("resource,view,rpc,row", [
    ("members", "lab_member_details", "get_lab_members_page", {"author_id": "auth_1", "name": "Jane", "orcid": None}),
    ("papers", "lab_papers", "get_lab_papers_page", PAPER),
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
        assert request.url.path == "/labs"
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
    assert "025_lab_page_functions.sql" in caplog.text
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
