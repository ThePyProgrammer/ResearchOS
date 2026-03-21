# Database Conventions

## Column Naming

All database columns use `snake_case`. The Python service layer accesses columns by their snake_case names directly when calling `get_client().table(...).select(...)`.

## ID Format

All primary keys are TEXT. The format is `{prefix}_{hex}` where the prefix identifies the entity type:

| Prefix | Entity |
|---|---|
| `lib_` | Library |
| `p_` | Paper |
| `w_` | Website |
| `gh_` | GitHub repo |
| `c_` | Collection |
| `a_` | Author |
| `pa_` | Paper–author link |
| `n_` | Note |
| `cm_` | Chat message |
| `pt_` | Paper text |
| `proj_` | Project |
| `exp_` | Experiment |
| `rq_` | Research question |
| `pp_` | Project paper link |
| `ep_` | Experiment paper link |
| `rqp_` | RQ paper link |
| `tc_` | Task column |
| `t_` | Task |
| `tfd_` | Task field def |
| `run_` | Workflow run |
| `prop_` | Proposal |
| `act_` | Activity item |

IDs are generated in the service layer (typically `f"{prefix}_{uuid.uuid4().hex}"`) before insert.

## Timestamp Format

All timestamp columns (`created_at`, `updated_at`, `extracted_at`, `started_at`) are TEXT columns storing ISO 8601 strings (e.g., `"2024-03-15T10:42:01Z"`). PostgreSQL date functions are not used — timestamps are generated in Python via `datetime.utcnow().isoformat() + "Z"` or equivalent.

## JSONB Columns

JSONB is used for fields that hold structured or variable-length data:

| Column | Shape | Used in |
|---|---|---|
| `authors` | `["Author Name", ...]` (strings) | `papers`, `websites`, `github_repos` |
| `tags` | `["tag1", "tag2", ...]` (strings) | `papers`, `websites`, `github_repos`, `tasks` |
| `collections` | `["c_abc123", ...]` (collection IDs) | `papers`, `websites`, `github_repos` |
| `topics` | `["topic1", ...]` (strings) | `github_repos` |
| `links` | `[{name: str, url: str}, ...]` | `papers`, `websites`, `github_repos` |
| `agent_run` | `{id, name, run_number}` | `papers` |
| `affiliations` | `[{institution, role, start_date, end_date}, ...]` | `authors` |
| `emails` | `["email@example.com", ...]` | `authors` |
| `steps` | `["Step 1", "Step 2", ...]` (strings) | `workflows` |
| `tools` | `["Tool A", ...]` (strings) | `workflows` |
| `tool_colors` | `["bg-blue-100 text-blue-700", ...]` (strings) | `workflows` |
| `constraints` | `["Year >= 2023", ...]` (strings) | `runs` |
| `logs` | `[{time, level, message}, ...]` | `runs` |
| `cost` | `{llm: {...}, total: "...", ...}` | `runs` |
| `trace` | `[{step, status, detail}, ...]` | `runs` |
| `badges` | `["Badge label", ...]` (strings) | `activity` |
| `action` | `{label: str, href: str}` | `activity` |
| `suggestions` | `[{id, type, note_id, note_name, ...}, ...]` | `chat_messages` |
| `config` | `{key: value, ...}` (arbitrary) | `experiments` |
| `metrics` | `{key: value, ...}` (arbitrary) | `experiments` |
| `custom_fields` | `{field_def_id: value, ...}` | `tasks` |
| `options` | `["Option A", "Option B", ...]` | `task_field_defs` |

## CamelModel Serialization

All Pydantic models inherit from `CamelModel` (`backend/models/base.py`):

```python
class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
```

This means:
- **Python fields** use `snake_case` (e.g., `library_id`, `arxiv_id`, `created_at`).
- **JSON responses** use `camelCase` (e.g., `libraryId`, `arxivId`, `createdAt`) when serialized with `model.model_dump(by_alias=True)`.
- **API requests** can send either `camelCase` (default) or `snake_case` (because `populate_by_name=True`).
- **Database inserts/updates** use `model.model_dump(by_alias=False)` → `snake_case` keys that match column names.
- **Database reads** use `Model.model_validate(row)` where `row` is a dict with snake_case keys from Supabase.

## Supabase Client Patterns

All database access is in `backend/services/`. The client is a singleton:

```python
from services.db import get_client
db = get_client()
```

Key patterns:

```python
# Read all
result = db.table("papers").select("*").execute()
rows = [Paper.model_validate(r) for r in result.data]

# Read with filter
result = db.table("papers").select("*").eq("library_id", library_id).execute()

# Create
db.table("papers").insert(paper_create.model_dump(by_alias=False)).execute()

# Update — always use exclude_unset=True, not exclude_none
updates = data.model_dump(exclude_unset=True)
db.table("papers").update(updates).eq("id", paper_id).execute()
# Then re-fetch: db.table("papers").select("*").eq("id", paper_id).execute()

# Delete
db.table("papers").delete().eq("id", paper_id).execute()
```

**Critical**: never chain `.select()` after `.eq()` on an update or delete. The `SyncFilterRequestBuilder` returned by `.eq()` does not have a `.select()` method — doing so raises `AttributeError`. Always re-fetch after update.

## Deduplication Columns

The dedup service (`backend/services/dedup_service.py`) uses three columns to find duplicates across all import paths:

1. `papers.doi` — case-insensitive exact match → confidence `"exact"`
2. `papers.arxiv_id` — exact match → confidence `"exact"`
3. `papers.title` — normalized (lowercase, no punctuation, collapsed whitespace, min 10 chars) → confidence `"likely"`
