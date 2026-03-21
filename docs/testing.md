# Testing

## Overview

Three test suites cover the codebase:

| Suite | Tool | Location | Command |
|-------|------|----------|---------|
| Backend unit/integration | pytest | `backend/tests/` | `uv run pytest` |
| Frontend unit/integration | vitest | `frontend/src/**/*.test.jsx` | `npm run test:run` |
| E2E | Playwright | `frontend/e2e/` | `npm run test:e2e` |

All three run automatically on every push to `main` and on every pull request via `.github/workflows/tests.yml`.

---

## Backend Tests

**Framework:** pytest
**Working directory:** `backend/`
**Config:** `backend/pyproject.toml`

### Running

```bash
cd backend
uv run pytest                  # run all tests
uv run pytest tests/test_api_contracts.py  # run a specific file
uv run pytest -k "gap"         # run tests matching a keyword
```

### Test fixture (`conftest.py`)

The `client` fixture creates a `fastapi.testclient.TestClient` and monkeypatches `seed_data` to a no-op:

```python
@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "seed_data", lambda: None)
    with TestClient(app_module.app, raise_server_exceptions=False) as test_client:
        yield test_client
```

Service functions are monkeypatched in individual tests using `monkeypatch.setattr`.

### What is covered

| File | Coverage |
|------|---------|
| `test_api_contracts.py` | Response shapes for list/get/create endpoints across all resources |
| `test_not_found_contract.py` | All 404 endpoints return `{"error": "not_found", "detail": "..."}` |
| `test_error_handlers.py` | FastAPI exception handler formatting |
| `test_papers_routes.py` | Paper CRUD, import, BibTeX parse/confirm, duplicate detection, PDF endpoints |
| `test_projects_routes.py` | Project CRUD, research questions, project-paper links |
| `test_experiment_routes.py` | Experiment CRUD, CSV import, reorder, duplicate |
| `test_gap_analysis_routes.py` | Gap analysis endpoint returns shaped GapSuggestion list |
| `test_gap_suggestion_model.py` | GapSuggestion model validation, ID generation, field defaults |
| `test_chat_and_notes_routes.py` | Chat and notes CRUD; message persistence patterns |
| `test_service_behaviors.py` | Service-layer logic: dedup normalization, title casing, author parsing |
| `test_keyword_extraction.py` | AI keyword extraction endpoint behavior |

### CI environment variables

Tests run with stub values for external services:

```yaml
SUPABASE_URL: https://example.supabase.co
SUPABASE_KEY: test-key
OPENAI_API_KEY: test-key
```

Actual Supabase and OpenAI calls are monkeypatched at the service layer.

---

## Frontend Unit/Integration Tests

**Framework:** vitest + @testing-library/react
**Working directory:** `frontend/`

### Running

```bash
cd frontend
npm run test        # watch mode
npm run test:run    # single pass (used in CI)
```

### Test files

Tests live alongside their source files:

| File | What is tested |
|------|---------------|
| `pages/Proposals.smoke.test.jsx` | Renders fetched proposals list and run details panel |
| `pages/Library.smoke.test.jsx` | Library table renders items; collection filter working |
| `pages/ProjectDetail.tableview.test.jsx` | Table vs tree view toggle; column rendering |
| `pages/ProjectDetail.csvimport.test.jsx` | CSV import modal: parse, preview, confirm flow |
| `pages/ProjectDetail.comparemodal.test.jsx` | Experiment comparison modal renders diffs |
| `pages/ProjectTasks.tasks.test.jsx` | Kanban board renders columns and tasks; drag-drop |
| `pages/ProjectReviewDashboard.test.jsx` | Citation network, timeline, and heatmap computation functions |
| `pages/ProjectReviewDashboard.smoke.test.jsx` | Page mounts and renders stats panel |

### Mocking

API modules are vi-mocked at the test level:

```jsx
vi.mock('../services/api', () => ({
  proposalsApi: { list: vi.fn(), approve: vi.fn() },
}))
```

Tests render components with `MemoryRouter` from react-router-dom to avoid needing a real browser router.

---

## E2E Tests (Playwright)

**Framework:** Playwright
**Config:** `frontend/playwright.config.js`
**Test directory:** `frontend/e2e/`
**Browser:** Chromium only

### Running

```bash
cd frontend
npm run test:e2e
```

The Playwright config starts the dev server on port 4173 if not already running:

```js
webServer: {
  command: 'npm run dev -- --host 127.0.0.1 --port 4173',
  port: 4173,
  reuseExistingServer: !process.env.CI,
}
```

In CI, a fresh server is always started. Locally, an existing server on port 4173 is reused.

### What is covered

E2E tests cover user-visible flows: page navigation, basic CRUD interactions, and layout smoke tests. Tests run against the real frontend with a real (or mocked) backend.

### CI setup

The `e2e` CI job depends on both `backend` and `frontend` jobs completing successfully before running.

---

## CI Workflow (`.github/workflows/tests.yml`)

Three parallel jobs:

```
backend  → pytest (Python 3.11, uv)
frontend → vitest + build check (Node 20)
e2e      → playwright (needs: [backend, frontend])
```

The `e2e` job runs after both other jobs succeed, ensuring the build is clean before running browser tests.
