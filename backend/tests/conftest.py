from collections.abc import Iterable
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import app as app_module


class DummyModel:
    def __init__(self, payload: dict):
        self.payload = payload

    def model_dump(self, by_alias: bool = False):
        return self.payload


def make_models(payloads: Iterable[dict]) -> list[DummyModel]:
    return [DummyModel(p) for p in payloads]


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(app_module, "seed_data", lambda: None)
    with TestClient(app_module.app, raise_server_exceptions=False) as test_client:
        yield test_client
