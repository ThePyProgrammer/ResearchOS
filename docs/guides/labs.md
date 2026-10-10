# Labs

## Setup

Apply [028_pi_membership.sql](../../backend/migrations/028_pi_membership.sql)
after migration 027 in the Supabase SQL editor. On fresh installations, apply
the base schema and migrations in order through 028. PostgreSQL 15+ is required.
The application does not automatically apply migrations.

Migration 028 adds membership to existing PIs, makes future PI assignments
create memberships atomically, and adds direct PI management functions.
It preserves existing lab, author, membership, and paper records and is safe to
rerun. It does not link papers automatically. A foreign key ensures a PI cannot
exist without membership; removing a membership also removes its PI role.

Migration 027 provides websites and the PI detail view. Migration 026 provides
explicit paper links and pickers; papers are never inferred from membership.
Missing required functions return an actionable 503 with the migration name.

## User flow

1. Open **Labs**, directly below **Authors**. The searchable directory shows
   compact, neutral cards with lab names, PI bylines, and available description
   and website. Desktop uses three columns, tablets two, and small screens one.
2. Create a lab with its name, optional description and up to 20 HTTP/HTTPS
   websites. **Edit lab** changes this metadata only. PI management lives on the
   dedicated lab page, not in the create/edit form.
3. **Add PIs** searches existing authors after two characters. Adding a PI
   immediately saves both PI status and membership in one transaction, then
   opens an optional picker of that author's existing papers. No papers are
   preselected. Choose papers or **Done without adding papers**; skipping keeps
   the PI and membership. Existing members can be promoted to PI, existing PIs
   cannot be added twice, and each lab allows up to 50 PIs.
4. **Add members** uses the same optional paper selection flow. PIs are already
   members, so they are excluded from this picker and from the ordinary member
   list. Each person appears once in the people sidebar.
5. PI and member rows share compact styling and icon controls. The paper icon
   reopens the author's paper picker. Removing a PI role leaves the author as
   an ordinary member; remove their membership from the Members section if
   needed. Neither action removes selected papers or author profiles.
6. **Add papers** selects saved papers across libraries, with or without
   authors/members. All pickers exclude papers already in the lab. Selections
   persist across searches/pages, with a 100-paper maximum per save.
7. The paper trash icon unlinks the paper from this lab only. Deleting a lab
   removes its associations while preserving source authors and papers.

A paper may belong to multiple labs but appears once in each. Future papers by
a member or PI still require explicit selection. Failed saves keep selections
for retry. Closing a paper picker never rolls back a successfully added person.

Each directory card opens `/labs/:id`. Old `/labs?lab=...` links redirect there.
Search and page state live in the directory URL and survive returning with All
labs or Back. The lab header sits directly on the page with icon actions. The
sidebar stacks above papers on small screens. The paper table follows Library
styling with authors below titles and no status column.

## Queries and contracts

Routes use typed Pydantic models, camelCase JSON, thin routers and service-only
database access. Missing labs retain the standard not_found response; unexpected
errors use the sanitized global 500 response.

| Action | API | Database round trips |
| --- | --- | --- |
| Directory/search | GET /api/labs | 1 counted, paginated lab_details view query including PIs |
| Lab details | GET /api/labs/{id} | 1 view query |
| PI search | GET /api/labs/pi-options?search=... | 1 bounded author projection |
| Add/remove PI | PUT/DELETE /api/labs/{id}/pis/{authorId} | 1 atomic RPC returning current detail |
| Member page | GET /api/labs/{id}/members | 1 RPC including count/existence |
| Ordinary member page | GET /api/labs/{id}/members?excludePis=true | 2 bounded reads, filtering PIs before count/pagination |
| Member search | GET /api/labs/{id}/member-options?search=... | 2: existence and bounded search |
| Add/remove member | PUT/DELETE /api/labs/{id}/members/{authorId} | 1 RPC |
| Papers/paper picker | GET /api/labs/{id}/papers or paper-options | 1 counted, paginated RPC |
| Add selected papers | POST /api/labs/{id}/papers | 1 atomic RPC |
| Unlink paper | DELETE /api/labs/{id}/papers/{paperId} | 2: existence and delete |
| Create/edit/delete lab | POST /api/labs or PATCH/DELETE /api/labs/{id} | 1 |

No per-card or per-author detail requests occur. Detail sections load concurrently.
PI changes update metadata from the mutation response and refresh only the member
section. Papers refresh only after paper changes. Search is debounced 300 ms.
Stale responses from prior queries or labs are ignored.

PI mutations lock the lab row, serialize with detail saves, and add/remove one
role without overwriting another caller's PI changes. Membership creation is
enforced by a trigger, including older API clients using piAuthorIds in PATCH.
PATCH still preserves omitted fields and clears explicit empty arrays.
Paper selections remain transactional, validate author-paper links when scoped,
and use conflict-safe inserts for retries.

Pages default to 30 labs, 50 members and 25 papers, capped at 100. Paper pickers
default to 25. Exact totals remain accurate beyond Supabase's 1,000-row cap.
Missing older page RPCs can fall back to bounded view queries; paper fallbacks
always use explicit links.

## Labs on authors

The Authors table and each author profile link to associated labs. A PI shows
only the **PI** label; an ordinary member shows **Member**. API flags remain
truthful: PIs have both isPi and isMember after migration 028.

Author responses include labs: [{id, name, isMember, isPi}]. Names and roles
come from explicit relationships, not paper inference. The service reads both
relationship sets in batches per group of up to 100 authors, with 500-row paging
for large results; there are no extra frontend requests or per-author reads.

## Verification

- Backend: uv run --group dev pytest tests/test_labs.py
- Frontend: npm run test:run -- src/pages/Labs.test.jsx src/pages/Authors.test.jsx src/pages/AuthorDetail.test.jsx
- Browser: npx playwright test e2e/labs.spec.js
- Run [pi_membership.sql](../../backend/tests/sql/pi_membership.sql) in disposable
  PostgreSQL after 028 to test membership, role promotion/removal, idempotent
  retries, explicit papers, old PATCH compatibility and cascading deletion.
  Fixtures roll back.
- Historical [lab_details.sql](../../backend/tests/sql/lab_details.sql) tests the
  original independent-PI behavior after 027 and before 028.
- [explicit_lab_papers.sql](../../backend/tests/sql/explicit_lab_papers.sql) tests
  explicit selections after 026; [labs.sql](../../backend/tests/sql/labs.sql)
  covers the original 024/025 behavior before upgrading.
