# Citation indexing

Paper details show outgoing references and incoming citations between papers in the same library, with provider reference evidence. OpenAlex and Crossref indexing runs in a separate durable worker. Reading the page does not contact a provider.

## Installation

Apply `backend/migrations/033_paper_citations.sql` after the existing numbered migrations. The historical consolidated `schema.sql` covers migrations 001–013 only and does not replace migration 033. This additive, replayable migration registers existing local DOI/arXiv identifiers but does not enqueue a historical backfill or contact external services.

Restart the application with this branch. Before migration, citation endpoints return a setup-specific HTTP 503 without preventing ordinary paper operations. Set a valid `OPENALEX_API_KEY` in `backend/.env` for bulk use; credentials stay server-side. Crossref does not require a separate key.

Start the worker from the repository root:

```powershell
uv run --directory backend python scripts/citation_worker.py
```

The process handles one job at a time with a default one-second interval. Multiple workers can claim distinct jobs, but begin with one to respect provider limits. No daemon or scheduled task is installed automatically. `--once` processes at most one eligible job; `--drain` stops when no jobs are currently eligible, leaving delayed retries queued.

## Backfill and resume

Select an explicit scope. Dry run reports selected counts without provider requests or database writes:

```powershell
uv run --directory backend python scripts/index_paper_citations.py --library-id LIBRARY_ID --dry-run
uv run --directory backend python scripts/index_paper_citations.py --library-id LIBRARY_ID
```

The enqueue command prints a manifest under ignored `backend/data/citations`. Keep it to resume enqueueing or restrict a worker to that batch:

```powershell
uv run --directory backend python scripts/index_paper_citations.py --resume data/citations/BATCH_ID.json
uv run --directory backend python scripts/citation_worker.py --batch data/citations/BATCH_ID.json --drain
```

`--all-libraries` selects all visible papers; matching remains separately scoped to each library. `--limit N` bounds the source population. `--refresh` requeues completed jobs. The local manifest freezes selected IDs; leases, retries, status, and evidence live in PostgreSQL. Keyset pagination avoids Supabase response caps. Concurrent inserts are covered by the database trigger even when outside the manifest population.

All paper insertion paths enqueue providers transactionally, independent of automatic notes. Changes to DOI, arXiv ID, title, authors, year, library, or PDF URL invalidate derived identities/evidence and requeue. DOI imports attach captured Crossref reference records to pending jobs, avoiding a repeat request when the worker has not already claimed the job. Imports remain usable if payload capture fails; backfill can refetch it. Inserts, edits, and deletions reconcile retained references against currently known local identities.

## Matching and status

Exact normalized DOI or verified arXiv identifier/location matches establish provider identities. Title-search results alone cannot. Candidate metadata is retained; a candidate-approval UI is deferred. OpenAlex IDs and Crossref reference DOIs match against local identities. Ambiguous duplicate targets remain unresolved. Shared identifiers suppress edges between copies of the same work. Semantic neighbors never create citations.

`A -> B` means A cites B. Incoming citations query the same edges in reverse. Provider assertions are not labeled PDF-verified. Original identifiers and reference records remain available when a provider relates preprint and published versions.

Jobs progress from `pending` to `running`, then `succeeded`, `partial`, `not_found`, or `failed`. Transient failures have up to five attempts with provider retry delays. Five-minute leases recover after crashes, and stale workers cannot publish after lease reclamation or source changes. Failed/partial refresh preserves previous good evidence. Successful refresh atomically replaces only that provider's evidence; edges survive while another provider still supports them.

The UI distinguishes unindexed, failed, and incomplete states. Incoming counts can remain incomplete until other source papers are indexed. Empty provider reference arrays are successful retrievals, not proof of empty bibliographies. Unmatched counts represent reference records, including ambiguous/self-references, rather than missing papers.

Publication transactions are serialized and reconcile a library at a time; network requests happen outside transactions. Measure multi-worker contention and large-library throughput before increasing worker counts.

## Coverage pilot

The pilot reads database metadata, sends selected titles/identifiers to OpenAlex and Crossref, retrieves referenced-work identities, and saves local JSON. It never writes to the database. Use only a scope approved for those external services:

```powershell
uv run --directory backend python scripts/pilot_paper_citations.py --library-id LIBRARY_ID --per-stratum 10 --output data/citations/pilot.json
```

It samples up to ten DOI, ten arXiv-only, and ten PDF-only records by stable ID, matching targets against the full selected scope. Authentication/rate-limit failures stop remaining requests to that provider. Reports include denominators, errors, requests, runtime, candidates, and evidence. They are ignored by Git because they contain library metadata. Review detected pairs against bibliographies before claiming precision; recall requires known positive pairs.

## Verification

```powershell
uv run --directory backend pytest tests/test_citation_identity.py tests/test_citation_service.py tests/test_citation_jobs.py tests/test_citation_routes.py
npm --prefix frontend run test:run -- src/components/PaperCitations.test.jsx src/services/api.test.js
```

Run `backend/tests/sql/paper_citations.sql` after migration 033 on a disposable database. A local PostgreSQL-compatible option is:

```powershell
npm install --prefix backend/data/citation-validation --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.14
node backend/tests/run_citation_sql.mjs
```

The runner uses actual repository library/paper definitions, applies migration 033 twice, and rolls back its fixtures. It verifies transaction behavior, not Supabase permissions or production multi-connection contention. Browser coverage lives in `frontend/e2e/citations.spec.js`.

## Rollback and limitations

Stop workers and hide/revert the citation UI/API to stop provider traffic. Keep pending jobs and evidence. To stop automatic queueing, disable `paper_citations_changed` in a controlled maintenance step and re-enable it before resuming. No destructive rollback is necessary.

Citations use the application's existing shared self-hosted access model, with library-scoped queries. They do not add user authentication or tenant isolation. PDF parsing, OCR, Semantic Scholar enrichment, cross-library graph views, and manual candidate approval are deferred. GROBID needs a configured service and a PDF read path supporting private storage. Truncated Markdown and first-page metadata extraction cannot substitute for full bibliographies.
