# Labs

## Setup

For an existing Labs installation, apply
[`027_lab_details.sql`](../../backend/migrations/027_lab_details.sql)
in the Supabase SQL editor. On a fresh installation, apply the base schema and
migrations in order, including 024 through 027. PostgreSQL 15+ is required for
the views' `security_invoker` option. The application does not apply migrations.

Migration 027 adds website URLs and independent PI-to-author links. Existing
labs start with no websites or PIs; rerunning preserves saved details. Apply 026
first if it has not been applied. Detail reads and saves return an actionable
503 naming 027 if its view or function is missing.

Migration 026 creates `lab_paper_links`, explicit-paper views, and functions for
pagination, selection, and membership changes. It does not infer or backfill
papers from members. Existing lab and author records are preserved. Rerunning
026 preserves explicit links and does not restore papers previously unlinked.

The application uses new function/view names so an unmigrated database cannot
silently return the previous automatically derived papers. Until 026 is applied,
affected actions return an actionable 503 naming the migration. If only the new
paper RPC is unavailable in PostgREST's schema cache, reads fall back to the new
explicit-paper view. The migration requests a schema-cache refresh on commit.

## User flow

1. Open **Labs**, directly below **Authors**, and create a named lab with an
   optional description, website links, and principal investigators. Labs span libraries.
   **Create lab** and **Edit lab** support up to 20 HTTP/HTTPS website URLs and
   50 PIs selected from existing authors. Search starts after two characters;
   select multiple authors and remove selections before saving. Changes save
   together; Cancel discards edits and errors keep form values for retry.
   Websites open in new tabs, and PI names link to their author profiles.
   PI assignments neither create memberships nor associate papers.
2. **Add members** searches existing authors. Adding an author saves their
   membership immediately, then opens an optional paper picker scoped to that
   author's existing `paper_authors` links. No papers are preselected. Select a
   subset and choose **Add selected papers**, or **Done without adding papers**.
   Closing this optional step keeps the saved membership.
3. **Add papers** in the Papers section searches saved papers across libraries,
   independently of membership. It works for labs with no members and for papers
   with no author records. Save/import a new paper into a library before linking
   it here.
4. The paper button on an existing member's card reopens that author's picker
   without adding the member again. All pickers exclude papers already in the
   lab. Search and pagination run on the server, and checkbox selections persist
   across pages/searches, with a visible selection list and a 100-paper cap.
5. The trash icon on a paper unlinks it from the lab, preserving the original paper.
   Removing a member preserves all lab-paper associations. Deleting a lab removes
   its memberships and paper associations, preserving authors and papers.

Membership and paper association are independent. Adding, removing, or deleting
an author does not automatically alter a lab's papers. Future papers by a member
also require explicit selection. A paper can belong to several labs and appears
only once within each lab, regardless of which picker added it.

The selected lab is in the URL (`/labs?lab=...`) for bookmarks, refresh, and browser
history. Forms use the existing minimizable window shell. Sections have separate
loading, empty, error, and retry states. Failed paper saves keep the selection;
the batch is transactional, so a missing or invalid paper does not partially add
other papers. On small screens, the list and detail stack; collapse the sidebar
for additional space.

## Queries and contracts

All routes use typed Pydantic request/response models and camelCase JSON. Routers
delegate database work to `services/lab_service.py`. Missing labs return the
standard `not_found` object; unexpected errors use the sanitized global 500.

| Action | API | Database round trips |
| --- | --- | --- |
| Browse/search labs | `GET /api/labs` | 1, including exact count |
| Lab metadata | `GET /api/labs/{id}` | 1 |
| PI author search | `GET /api/labs/pi-options?search=...` | 1 bounded author projection, no paper reads |
| Member page | `GET /api/labs/{id}/members` | 1 RPC, including existence/count |
| Selected paper page | `GET /api/labs/{id}/papers` | 1 RPC, including existence/count |
| Paper picker | `GET /api/labs/{id}/paper-options` | 1 RPC; optional `author_id`, title search, count/page |
| Link selected papers | `POST /api/labs/{id}/papers` | 1 atomic RPC; body `{paperIds, authorId?}` |
| Unlink paper | `DELETE /api/labs/{id}/papers/{paperId}` | 2: existence + relationship delete |
| Author picker | `GET /api/labs/{id}/member-options?search=...` | 2: existence + bounded search |
| Add/remove member | `PUT/DELETE /api/labs/{id}/members/{authorId}` | 1 RPC; no paper changes |
| Create/edit/delete lab | `POST /api/labs`, `PATCH/DELETE /api/labs/{id}` | 1; empty PATCH uses 1 read |

Metadata, members, and selected papers load concurrently on selection. Searches
are debounced by 300 ms; author search starts after two characters. Membership
mutations refresh only members. Paper mutations refresh only selected papers.
Editing metadata updates detail from the response and refreshes the lab list.
Detail reads include PI names through `lab_details`, with no per-author calls.
The list uses the base labs table and does not aggregate PIs. `save_lab_details`
saves metadata and replaces the selected PI set in one transaction, locking the
lab and validating all selected authors. A missing PI rolls back the whole save.
PATCH accepts `websites` and `piAuthorIds`; omitted fields are preserved and empty
arrays clear them. Responses expose `websites` and, for detail/create/update,
`principalInvestigators` with `authorId`, `name`, and `orcid`. PI names always
reflect current profiles. Deleting an author cascades its PI links; deleting a
lab leaves author profiles intact. PI links have a composite key and reverse
author index, independent of both membership and paper links.
Responses from earlier searches or lab selections are ignored. The shared API
wrapper coalesces simultaneous identical reads without caching settled results.

Lab/member/paper pages default to 30/50/25 rows and cap at 100; paper options
default to 25. Exact totals remain available past the last page, including beyond
Supabase's default 1,000-row cap. Only a narrow metadata projection is returned,
without notes or abstracts. No query runs per selected paper or per member.

`lab_paper_links` has a composite primary key `(lab_id, paper_id)` and a reverse
paper index. Foreign keys cascade when a lab or source paper is deleted.
`lab_members` has an independent composite key `(lab_id, author_id)`.
The author-scoped picker uses indexed `paper_authors` links and an anti-join to
exclude existing associations. The batch RPC validates all IDs before inserting
and uses `ON CONFLICT DO NOTHING` for safe retries. An author-scoped batch also
validates that each selected paper belongs to that author. Database access follows
the current shared-workspace model; views/functions run with caller permissions.

If a page RPC returns `PGRST202`, its fallback performs one bounded view query
with a count and checks lab existence only for zero results. The paper fallback
only uses `lab_selected_papers`, never the old member-derived view. Other database
errors propagate. The earlier 025 repair remains useful for missing member-page
functions on older installations; apply migrations in order.

## Verification

- `cd backend; uv run --group dev pytest tests/test_labs.py`
- `cd frontend; npm run test:run -- src/pages/Labs.test.jsx`
- `cd frontend; npx playwright test e2e/labs.spec.js`
- Run [`lab_details.sql`](../../backend/tests/sql/lab_details.sql) after 027 in
  disposable PostgreSQL to verify multiple PIs, atomic saves, partial updates,
  clearing details, current author names, and independent deletion behavior.
- Run [`explicit_lab_papers.sql`](../../backend/tests/sql/explicit_lab_papers.sql)
  after migration 026 in disposable PostgreSQL. Fixtures roll back. It checks
  empty/default selection, member independence, authorless papers, atomic failure,
  duplicate retries, deletion behavior, and 1,105-paper pagination.
- [`labs.sql`](../../backend/tests/sql/labs.sql) covers the original 024/025
  behavior and is intended to run before applying 026 during upgrade testing.
