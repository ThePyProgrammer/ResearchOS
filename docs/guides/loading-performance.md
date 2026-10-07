# Library loading investigation

## Notes page

The library Notes page now uses `POST /api/notes/batch` rather than one notes
request per paper, website, or repository. Requests contain up to 100 typed
sources, with at most three concurrent requests. The backend groups sources by
type and reads notes in 500-row pages with stable ordering. For 100 papers with
fewer than 500 total notes, this replaces 100 notes queries with one.

The response includes empty source folders and complete note content, preserving
search, wiki links, and graph data. Initial loading and Copilot refreshes share
this path. Loading failures are visible and retryable; late responses from a
previous library cannot replace current notes. Synchronous notes routes run in
FastAPI's worker pool instead of blocking the event loop.

`backend/migrations/023_note_source_indexes.sql` supplies optional indexes for
the three note source columns. It is not required by the new endpoint and has
not been applied to a live database. Live Supabase latency has not been measured.
The separate project Notes IDE and full note-content payload sizes remain
potential optimization targets.

## Checkbox batch actions

Status changes and deletes now use `POST /api/batch/items`, a typed endpoint
limited to 100 items per request. The frontend divides larger selections into
chunks and runs at most three requests concurrently. The service groups items
by table and uses one set-based write per table. Updating 100 papers' statuses
therefore takes one database call instead of 300 calls through individual PATCH
requests. Single-item updates also reuse the database's returned row instead of
reading before and after the write.

Collection additions read current memberships and group compatible items into
writes, retaining existing memberships. Writes check the original membership
value so concurrent changes are reported for retry instead of overwritten.
This path requires no new database migration or RPC.

Every metadata batch returns confirmed IDs and per-item failures. Successful
chunks update the UI immediately; failed items remain selected, errors are
visible, and other chunks continue. These operations are not one transaction
across the whole selection. A connection loss after a write can leave its result
unconfirmed; refresh before retrying those items.

Tagging, embeddings, and notes previews split selections at the existing
100-item limit. Failed AI chunks do not prevent later chunks from running.
The older AI endpoints return summary counts rather than item identities;
partial results are displayed as unconfirmed instead of marking every item done.
Notes/PDF jobs default to three workers. Synchronous note generation runs in
FastAPI's worker pool. Retries retain earlier results, and cancelling queued work
does not label a successfully completed in-flight request as cancelled.

## Changes

- The synchronous Supabase client was called directly from async library CRUD
  routes, blocking the event loop. These routes now use synchronous FastAPI
  handlers, allowing the framework's worker pool to overlap independent requests.
  Routes that actually await imports/uploads remain async.
- Paper, website, and repository collection/status filters now run in Supabase
  before rows are downloaded. Paper substring search retains its existing behavior.
- Collection counts select only membership columns, scope reads to the requested
  library, skip empty collection lists, and read in 500-row pages.
- The collection top-authors panel previously re-read each paper and scanned the
  entire authors table for each displayed name. It now reuses the fetched paper
  models and batches exact normalized-name lookups (up to 100 names per request).
  For 100 papers and 10 displayed names, this replaces about 110 enrichment
  requests with one. This is a query-count comparison, not a live latency benchmark.
- The Library page waits for library initialization and no longer reloads all
  three item types on local collection/status navigation. Explicit item-change
  events still refresh it, including Quick Add. Late responses from a previous
  library are ignored. Search requests now include the active library ID and
  display errors instead of silently launching duplicate fallback list requests.
- The API wrapper shares simultaneous identical default GET requests, removes
  them when settled, and invalidates sharing around mutations. It does not cache
  completed responses.

## Database indexes

Apply `backend/migrations/022_loading_indexes.sql` through the Supabase SQL editor
to add library/sort indexes and JSONB collection-containment indexes. This file
has been prepared locally; it has not been applied to a live database. The code
changes do not depend on the migration.

## Remaining work and measurement limits

The main Library list still loads complete item models and filters/sorts them in
the browser. True server-side pagination needs a coordinated UI/API change to
preserve counts, sorting, filtering, and bulk selection. Existing list endpoints
also remain subject to the configured Supabase response row limit.

Other features still contain synchronous service calls in async paths, including
search/import workflows. This is
a focused improvement to library loading, not a conversion of the entire backend
to an async database client.

No before/after live Supabase benchmark or query plan was measured. Compare browser network
timings before/after on the same library, and inspect database query plans before
attributing any remaining delay to hosting region, network latency, or indexes.


## Authors and author references

The Authors page already made one HTTP request per load, but its enrichment
scanned all paper-author links, papers, and libraries. It now filters links to
returned authors, joins only their papers, and fetches only referenced libraries.
Search waits for a 300 ms typing pause and ignores obsolete responses.

Paper author references previously used one link query plus up to five queries
per author. They now batch profiles and enrichment: at most four service queries
for up to 100 authors, fewer than 500 links per batch, and up to 100 libraries.
The existing paper-existence check adds one query at the route level. Author
paper lists similarly use two service queries for fewer than 500 links and up to
100 papers, instead of one plus a separate lookup per paper. ID batches are
limited to 100 and result pages to 500, with stable ordering and complete counts.
The response schemas, link positions, and library associations are preserved.
Ordinary synchronous author routes now run in FastAPI's worker pool; existence
checks skip unused enrichment. No database migration is needed.

The batched list query was verified against the configured Supabase database.
One cold read of ten authors took 4.79 seconds; this is not a before/after latency
benchmark. Query-count, pagination, API-shape, stale-search, and browser workflow
regressions are covered by tests. Optional fuzzy author matching and potential
paper discovery still scan their respective tables; the directory also retains
its existing 50-author default limit.
