# Citation indexing

Paper details show outgoing references and incoming citations between papers in the same library, with provider reference evidence. OpenAlex and Crossref indexing runs in a separate durable worker. Reading the page does not contact a provider.

## Installation

Apply `backend/migrations/033_paper_citations.sql` after the existing numbered migrations. The historical consolidated `schema.sql` covers migrations 001–013 only and does not replace migration 033. This additive, replayable migration registers existing local DOI/arXiv identifiers but does not enqueue a historical backfill or contact external services.

Restart the application with this branch. Before migration, citation endpoints return a setup-specific HTTP 503 without preventing ordinary paper operations. Set a valid `OPENALEX_API_KEY` in `backend/.env` for bulk use; credentials stay server-side. Crossref does not require a separate key.

## Upgrading an earlier citation installation

An earlier revision of 033 could be installed without `citation_local_ids`, local identifier seeding, or the DELETE event on `paper_citations_changed`. Running the full file at that time does not install later changes to that file. Diagnose this with `backend/scripts/diagnose_citation_install.sql` in the same Supabase project's SQL editor.

After 033?035, stop citation workers and apply `036_repair_citation_identity_setup.sql` in full. It upgrades the citation functions and trigger, seeds local DOI/arXiv identifiers, reconciles retained references, and requests a REST schema-cache reload. It preserves existing jobs, raw references, published runs, PDF provider constraints and the PDF revision fingerprint. It does not enqueue historical papers or contact providers. Do not replay 033 over the PDF migrations.

Restart the worker after applying 036. A backfill of the intended library is still needed to resolve OpenAlex identities for potential citation targets; seeding local DOI/arXiv IDs alone cannot match references stored only as OpenAlex work IDs. Empty provider reference lists can remain empty after this upgrade.

The disposable SQL runner simulates the missing helper, absent local IDs and older trigger before applying 036 twice. It checks retained-record/job preservation, reconciliation of an unindexed DOI target, unchanged PDF fingerprints, both PDF engines' opt-in and the full citation lifecycle fixtures.

## Optional PDF bibliography extraction

Apply `034_pdf_citations.sql` and then `035_local_pdf_citations.sql` after 033. The default extractor uses the existing PyMuPDF dependency locally; no GROBID service or new API key is required. Click **Index PDF bibliography** for a managed PDF, or add `--include-pdf` to a new backfill:

```powershell
uv run --directory backend python scripts/index_paper_citations.py --library-id LIBRARY_ID --include-pdf --dry-run
uv run --directory backend python scripts/index_paper_citations.py --library-id LIBRARY_ID --include-pdf
```

PDF indexing remains opt-in. New batches record `pdf_engine: pymupdf`; old manifests without that field retain their original GROBID scope and service requirement. Managed GCS/Supabase credentials read private files directly. Arbitrary external PDF URLs must first be stored through the existing import/upload path. The size limit is 100 MiB; local extraction also rejects encrypted documents and documents over 1,000 pages.

The local extractor recognizes numbered bibliographies beneath References/Bibliography/Works Cited headings, orders one- or two-column text, and retains raw text, page numbers, parser version and PDF SHA-256. It uses only explicit DOI/arXiv identifiers. Title-only references and conflicting identifiers remain unresolved. Nonsequential numbering, unrecognized bibliographies and uncertain boundaries return partial results without publishing new identifiers or erasing previous successful evidence. Scans, unnumbered references, unusual layouts and line-wrapped identifiers remain coverage limitations. No OCR or fuzzy title linking is performed. Extraction success does not guarantee that every bibliography entry was found.

Run a read-only pilot without applying migrations or writing citation tables:

```powershell
uv run --directory backend python scripts/pilot_pdf_citations.py --paper-id PAPER_ID --output data/citations/pdf-pilot.json
```

This downloads the managed PDF, parses it locally, and saves raw evidence and exact same-library matches. Reports must use a new output path. The five-PDF local pilot retained 203 reference records: three successful extractions (119 records) and two partial results (84 records). It found **zero additional exact local links**. See `docs/local-pdf-citation-pilot-report.md`. Keep this feature opt-in; the evidence does not justify a library-wide automatic PDF backfill.

GROBID remains an optional alternate parser. Configure `GROBID_URL` and explicitly use `POST /api/papers/{id}/citations/pdf/reindex?engine=grobid` or add `--engine grobid` to the pilot command to send a PDF to that service. The adapter disables external metadata consolidation and HTTP redirects. No real GROBID pilot has been run. Leaving `GROBID_URL` blank does not affect local extraction or OpenAlex/Crossref indexing.

Migration 034 versions every explicit PDF URL update, including replacing the same storage key. Migration 035 preserves independent opt-in for each PDF engine: source changes requeue only engines previously selected. Stale workers cannot publish, and extraction re-reads the file to detect replacement during processing. Apply migrations in order; do not replay 033/034 after 035.

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

The runner uses actual repository library/paper definitions, applies migrations 033, 034 and 035 twice, and rolls back its fixtures. It verifies transaction behavior, including same-URL PDF replacement, not Supabase permissions or production multi-connection contention. Browser coverage lives in `frontend/e2e/citations.spec.js`. PDF parser/storage fixtures are in `backend/tests/test_local_pdf_references.py`, `backend/tests/test_pdf_references.py` and `backend/tests/test_pdf_storage.py`.

## Rollback and limitations

Stop workers and hide/revert the citation UI/API to stop provider traffic. Keep pending jobs and evidence. To stop automatic queueing, disable `paper_citations_changed` in a controlled maintenance step and re-enable it before resuming. No destructive rollback is necessary.

Citations use the application's existing shared self-hosted access model, with library-scoped queries. They do not add user authentication or tenant isolation. OCR, Semantic Scholar enrichment, cross-library graph views, and manual candidate approval remain deferred. The GROBID adapter is implemented and fixture-tested; a real service and coverage pilot are still needed. It reads full PDF bytes rather than truncated Markdown or first-page metadata.
