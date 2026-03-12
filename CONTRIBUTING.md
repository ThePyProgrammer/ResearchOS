# Contributing to ResearchOS

Thank you for your interest in contributing! This guide will get you set up and explain how to submit good contributions.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold these standards.

---

## Getting Started

Before diving in, please:

1. **Search existing issues and PRs** before opening a new one — duplicates slow everyone down.
2. **Open an issue first** for any non-trivial change (new feature, architectural change, breaking fix). This prevents wasted effort if the direction isn't aligned.
3. For small, obvious fixes (typos, dead links, clear bugs) you can go straight to a PR.

---

## Project Structure

```
researchos/
├── backend/           # Python FastAPI backend
│   ├── app.py         # Entry point — CORS, routers, startup seeding
│   ├── models/        # Pydantic domain models (all inherit CamelModel)
│   ├── services/      # Business logic + all Supabase access
│   ├── routers/       # Thin FastAPI route handlers
│   ├── agents/        # pydantic-ai agent definitions
│   └── migrations/    # SQL migration files for Supabase
└── frontend/          # React 18 SPA (Vite)
    └── src/
        ├── services/api.js       # All API calls — never fetch directly in components
        ├── context/              # React context (active library state)
        ├── components/           # Shared UI components
        └── pages/                # Route-level page components
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed walkthrough.

---

## Development Setup

### Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node.js 18+ and npm
- A [Supabase](https://supabase.com) project (free tier works fine)
- An OpenAI API key

### 1. Clone the repository

```bash
git clone https://github.com/<org>/researchos.git
cd researchos
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in your keys:
#   OPENAI_API_KEY=sk-...
#   SUPABASE_URL=https://<project-ref>.supabase.co
#   SUPABASE_KEY=<anon-key>
```

### 3. Run database migrations

Open the Supabase SQL editor and run **`backend/migrations/schema.sql`** — this single file creates the complete schema in one shot.

If you prefer to apply migrations incrementally (e.g. against an existing database), the numbered files in `backend/migrations/` can be run in order instead.

### 4. Start the backend

```bash
cd backend
uv sync --group dev
uv run uvicorn app:app --reload --port 8000
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to the backend.

---

## How to Contribute

### Bug reports

Use the **Bug Report** issue template. Include:

- What you did, what you expected, and what actually happened.
- Steps to reproduce (minimal, if possible).
- Browser/OS, Python version, and Node version.
- Relevant logs (backend stderr, browser console).

### Feature requests

Use the **Feature Request** issue template. Describe the problem you want to solve, not just the solution. If you have a specific implementation in mind, include it — but the problem statement is what matters most.

### Code contributions

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b fix/issue-123
   ```
2. Make your changes, following the [Coding Standards](#coding-standards) below.
3. Add or update tests for your changes.
4. Verify everything passes (see [Testing](#testing)).
5. Open a pull request against `main`.

---

## Pull Request Process

1. **One concern per PR.** Split unrelated changes into separate PRs.
2. **Fill in the PR template.** Describe what changed and why. Link the relevant issue.
3. **All CI checks must pass.** Backend pytest, frontend Vitest/build, and Playwright E2E.
4. **Keep diffs focused.** Avoid reformatting unrelated code or large whitespace-only changes.
5. A maintainer will review. Address feedback by pushing new commits — don't force-push after a review has started.
6. Once approved and CI is green, a maintainer will merge.

---

## Coding Standards

### Backend (Python)

- **Python 3.11+**, managed via `uv`. Never use `pip install` directly.
- All models must inherit `CamelModel` from `models/base.py` — this ensures automatic snake_case → camelCase serialization.
- **Routers are thin.** They validate input, call a service function, and return. No business logic in routers.
- **All DB access lives in `services/`**. Routers never import `get_client()` directly.
- Return `None` from service functions for not-found cases; routers check and raise `HTTPException(404)`.
- Use `logger = logging.getLogger(__name__)` in every module that logs.
- Background tasks must catch and log all exceptions — never let them propagate silently.
- Use `model_dump(exclude_unset=True)` for partial updates — never `exclude_none`.
- No `snake_case` keys may leak into API responses. Run `assert_camel_case_payload` in tests.

Error response shapes:
- `404`: `{"error": "not_found", "detail": "..."}`
- `500`: `{"error": "internal_server_error", "detail": "An unexpected error occurred."}`
- `409` (duplicate): `{"duplicates": [...], "paper": {...}}`

### Frontend (JavaScript / JSX)

- React 18, functional components only.
- Tailwind CSS utility classes in JSX `className` — no per-component CSS files.
- All API calls go through `src/services/api.js` — components never call `fetch` directly.
- `camelCase` for variables and functions; `PascalCase` for components and files.
- `UPPER_SNAKE_CASE` for module-level constants.
- Follow the loading/error state pattern:
  ```js
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  ```
- Wrap context mutations in `useCallback`.
- No TypeScript — plain `.js` / `.jsx`.

---

## Testing

### Backend

```bash
cd backend
uv run --group dev pytest           # run all tests
uv run --group dev pytest -x        # stop on first failure
uv run --group dev pytest -k "dedup"  # filter by name
```

New backend code should have corresponding tests in `backend/tests/`. Mock at the router's import path (e.g., `mocker.patch("routers.papers.paper_service.list_papers", ...)`).

### Frontend unit tests

```bash
cd frontend
npm run test:run
```

### Frontend E2E tests

```bash
cd frontend
npx playwright install --with-deps chromium  # first time only
npm run test:e2e
```

### Before submitting

Run the full suite and verify:

- [ ] `uv run --group dev pytest` — all backend tests pass
- [ ] `npm run test:run` — all frontend unit tests pass
- [ ] `npm run build` — production build succeeds with no errors
- [ ] `npm run test:e2e` — Playwright smoke passes

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

Examples:
```
feat(import): add OpenAlex metadata resolution
fix(dedup): handle missing DOI in normalized-title tier
docs(readme): update migration list with 008–010
test(papers): add contract test for bulk PDF fetch endpoint
```

Keep the subject line under 72 characters. Use the body to explain *why*, not *what*.

---

## Questions?

Open a [Discussion](../../discussions) or file an issue — we're happy to help you get oriented.
