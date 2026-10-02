# Library loading investigation

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
