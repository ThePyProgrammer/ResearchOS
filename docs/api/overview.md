# API Overview

## Base URL

All routes are prefixed with `/api`. In development, the Vite proxy forwards `/api` requests from port 5173 to the FastAPI server on port 8000.

```
http://localhost:8000/api
```

## Response Format

All responses are camelCase JSON. Python model fields (`snake_case`) are converted to `camelCase` via Pydantic's `alias_generator=to_camel` when serialized with `model.model_dump(by_alias=True)`.

Example: the Python field `library_id` becomes `libraryId` in all JSON responses.

## Error Format

All error responses follow a consistent structure:

```json
{
  "error": "not_found",
  "detail": "Paper not found"
}
```

| HTTP Status | `error` value | Meaning |
|---|---|---|
| 404 | `"not_found"` | Resource does not exist |
| 422 | varies | Validation error (FastAPI default or explicit check) |
| 409 | varies | Conflict (duplicate detected) |
| 500 | `"internal_server_error"` | Unhandled exception |
| 502 | varies | Upstream API failure (Crossref, arXiv, etc.) |
| 503 | varies | Dependency unavailable (e.g., umap-learn not installed) |

All 404 responses have the shape `{"error": "not_found", "detail": "..."}`. Other error responses may have only `{"detail": "..."}`.

## CORS

The API allows cross-origin requests from:
- `http://localhost:5173`
- `http://127.0.0.1:5173`

All HTTP methods and headers are allowed. Credentials are permitted.

## CamelModel Serialization

Route handlers serialize with `model.model_dump(by_alias=True)`, which produces camelCase JSON. For example:

```python
# Python model field
library_id: Optional[str] = None

# JSON response key
"libraryId": "lib_default"
```

Requests from the frontend can send either camelCase or snake_case keys because `populate_by_name=True` is set on all models.

## Authentication

There is no authentication. The application is designed for single-user, local use. The Supabase publishable (anon) key is used directly from the backend — do not expose this server publicly without adding auth.

## User Endpoint

```
GET /api/user
```

Returns a static user profile object (hardcoded in `app.py`):

```json
{
  "name": "Dr. Researcher",
  "org": "Lab Alpha",
  "initials": "DR"
}
```

## Startup Behavior

On startup, the server:
1. Seeds all tables with sample data if they are empty (see `SEED` dict in `app.py`).
2. Runs `_check_migrations()` to probe for missing DB columns and logs warnings if any are found.
