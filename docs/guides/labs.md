# Labs

## Setup

Apply [`024_labs.sql`](../../backend/migrations/024_labs.sql) in the Supabase SQL
editor before using Labs. It depends on the existing `libraries`, `papers`,
`authors`, and `paper_authors` tables. On a fresh database, apply the base schema
and subsequent migrations in order. The application does not apply migrations.

If Labs tables/views are available but requests report `PGRST202` for
`get_lab_members_page` or `get_lab_papers_page`, apply
[`025_lab_page_functions.sql`](../../backend/migrations/025_lab_page_functions.sql).
This repair installs both page functions and refreshes PostgREST's schema cache,
preserving existing data. It is safe to rerun even after the full 024 migration.
The backend also handles this specific missing-function response by querying
the existing paginated views, so the page remains usable before the repair.

The migration is transactional and can be rerun. It creates `labs`,
`lab_members`, two views, three SQL functions, and supporting indexes, then asks
PostgREST to refresh its schema cache. PostgreSQL 15+ is required for the views'
`security_invoker` option. Access follows the current shared-workspace model used
by Authors; the views and functions run with the caller's permissions.

## User flow

1. Open **Labs**, directly below **Authors** in the sidebar.
2. Create a lab with a name and optional description. The new lab opens immediately.
3. Choose **Add members**, search existing authors, and add them individually.
   Search starts after two characters and a 300 ms pause. Existing members are
   excluded, including members on other pages. Missing authors can be created
   on Authors first. An author may belong to multiple labs.
4. View the paper table, ordered newest year first, with title, authors, year,
   venue, library, and reading status. Search filters paper titles. Paper titles
   and member names open their existing detail pages.
5. Edit the lab's metadata, remove members, or confirm deletion of the lab.
   Removing memberships or deleting a lab preserves author profiles and papers.

The selected lab is in the URL (`/labs?lab=...`), so refresh, bookmarks, and browser
back/forward preserve selection. Forms use the existing minimizable window shell.
Each section has its own loading, empty, error, and retry state. On small screens,
the list and detail stack; use the sidebar's existing collapse control for space.

## Meaning of a lab's papers

Labs and authors are global across libraries. Papers are the distinct union of
saved papers with explicit `paper_authors` links to current lab members. Matching
uses author IDs, never fuzzy names. Shared papers appear once; newly linked
papers appear on the next read. Removing a member retains papers linked to other
remaining members. Author deletion cascades memberships.

This is a view of current members' work, including older work. It does not infer
historical institutional affiliation, fetch publications from external sites, or
store manual lab-to-paper assignments. An empty paper table may mean the author
profiles still need paper links, even if paper metadata contains their names.

## Queries and contracts

All routes use typed Pydantic request/response models and camelCase JSON. Routers
delegate database work to `services/lab_service.py`. Missing labs return the
standard `not_found` object; unexpected failures use the global sanitized 500.

| Action | API | Database round trips |
| --- | --- | --- |
| Browse/search labs | `GET /api/labs` | 1, including exact count |
| Lab metadata | `GET /api/labs/{id}` | 1 |
| Member page | `GET /api/labs/{id}/members` | 1 RPC, including existence/count |
| Paper page/title search | `GET /api/labs/{id}/papers` | 1 RPC, including existence/count |
| Author picker | `GET /api/labs/{id}/member-options?search=...` | 2: lab existence + bounded search |
| Create/edit/delete | `POST /api/labs`, `PATCH/DELETE /api/labs/{id}` | 1; empty PATCH uses 1 read |
| Add member | `PUT /api/labs/{id}/members/{authorId}` | 3: lab, author, idempotent insert |
| Remove member | `DELETE /api/labs/{id}/members/{authorId}` | 2: lab existence + delete |

If a page RPC returns `PGRST202`, that request uses the view fallback: the failed
RPC plus one bounded view query with an exact count, and one lab existence read
only when the count is zero. Search, sorting, deduplication, and pagination stay
in PostgreSQL. Other database errors still propagate to the global handler.
Applying 025 restores the one-call path on the next request without restarting.

The first lab selection loads metadata, members, and papers concurrently, with
one round trip each. The list has its own single request. Search/pagination
refresh only their section. Membership writes refresh the member/paper pages,
resetting both offsets; an open picker also refreshes its options. Editing
metadata refreshes the list and uses the mutation response for the detail view.
Stale responses from old searches or selections are ignored. The shared API
wrapper coalesces simultaneous identical reads without caching settled results.

Lab/member/paper pages default to 30/50/25 rows and cap at 100. The picker returns
at most 20 rows by default (API cap 50). Counts remain correct past the final
page, including beyond Supabase's default 1,000-row response cap. Empty labs
return empty pages; missing labs return 404.

`lab_members` has a composite primary key `(lab_id, author_id)` and cascading
foreign keys. A reverse author index supports deletion; the covering
`paper_authors(author_id, paper_id)` index supports the union. The SQL view
deduplicates paper IDs before joining metadata. The paper RPC filters a lab's
papers once in a materialized CTE for the page and count. This keeps computation
inside PostgreSQL and returns only a narrow page projection, without abstracts,
notes, all-author enrichment, client-side catalog scans, or per-member queries.

## Verification

- `cd backend; uv run --group dev pytest tests/test_labs.py`
- `cd frontend; npm run test:run -- src/pages/Labs.test.jsx`
- `cd frontend; npx playwright test e2e/labs.spec.js`
- Run [`backend/tests/sql/labs.sql`](../../backend/tests/sql/labs.sql) after the
  base tables and migration in a disposable PostgreSQL database. It rolls back
  fixtures and checks 1,105 papers, deduplication, membership overlap, pagination,
  search escaping, foreign keys, and deletion semantics. The base schema's
  Supabase-specific storage section is unnecessary for these tests.
