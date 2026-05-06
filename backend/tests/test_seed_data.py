from __future__ import annotations

import app as app_module


class FakeResponse:
    def __init__(self, data: list[dict]):
        self.data = data
        self.count = len(data)


class FakeQuery:
    def __init__(self, client: FakeClient, table_name: str):
        self.client = client
        self.table_name = table_name
        self.rows: list[dict] | None = None

    def select(self, *args, **kwargs):
        return self

    def limit(self, count: int):
        return self

    def insert(self, rows: list[dict]):
        self.rows = rows
        return self

    def execute(self):
        if self.rows is None:
            return FakeResponse(self.client.tables.get(self.table_name, []))

        self.client.inserts.setdefault(self.table_name, []).append(self.rows)
        self.client.tables.setdefault(self.table_name, []).extend(self.rows)
        return FakeResponse(self.rows)


class FakeClient:
    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = tables
        self.inserts: dict[str, list[list[dict]]] = {}

    def table(self, table_name: str):
        return FakeQuery(self, table_name)


def test_seed_data_skips_demo_proposals_when_demo_papers_are_missing(monkeypatch):
    client = FakeClient(
        {
            "libraries": [{"id": "lib_default"}],
            "papers": [{"id": "real_paper"}],
            "websites": [],
            "github_repos": [],
            "collections": [{"id": "c1"}],
            "workflows": [{"id": "wf1"}],
            "runs": [{"id": "wrk_7a9b2c"}],
            "proposals": [],
            "activity": [{"id": "a1"}],
        }
    )
    monkeypatch.setattr(app_module, "get_client", lambda: client)

    app_module.seed_data()

    assert "proposals" not in client.inserts
