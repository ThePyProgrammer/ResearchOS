# Library loading investigation

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
search/import workflows, and per-item lookups in author detail loading. This is
a focused improvement to library loading, not a conversion of the entire backend
to an async database client.

No live Supabase timing or query plan was measured. Compare browser network
timings before/after on the same library, and inspect database query plans before
attributing any remaining delay to hosting region, network latency, or indexes.
