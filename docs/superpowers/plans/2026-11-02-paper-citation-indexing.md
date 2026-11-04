# Paper citation indexing execution plan

Date: November 2, 2026  
Branch: `feat/paper-citation-indexing`  
Status: OpenAlex/Crossref and opt-in PDF adapter implemented; live rollout and GROBID coverage pilot pending
Basis: [citation indexing investigation](../../citation-indexing-investigation.md)

## Execution record - November 3, 2026

Implemented the OpenAlex/Crossref index, migration 033, durable worker/backfill tooling, APIs, paper-detail lists, and regression coverage. See [operator guide](../../guides/citation-indexing.md) and [approved read-only pilot](../../citation-indexing-pilot-report.md).

The pilot sampled 30 of 391 papers, made 56 provider requests, and found one local pair: MAGiC-SLAM cites SplaTAM. The source PDF confirms entry [15] on page 9. OpenAlex resolved 18 source identities, but ten returned empty reference arrays. Nine of ten sampled arXiv papers had no provider references. Crossref supplied 460 reference records from nine DOI sources but no additional local pairs in this sample. PDF extraction remains necessary follow-up work; Task 9 is not complete.

Implementation adjustments:

- Database triggers enqueue and invalidate work for every creation/edit/deletion path. Queue creation is part of the paper transaction; provider work runs separately. A database enqueue failure fails the create transaction explicitly rather than committing an unqueued paper. Captured Crossref payload failure is recoverable by refetching.
- Local DOI/arXiv identities are registered before provider indexing. Each published identity triggers SQL reconciliation, so correctness does not depend on a separate global resolution pass. Provider calls are per source; reference matching uses indexed SQL joins without one remote lookup per reference. The read-only pilot batches referenced-work metadata requests.
- Durable jobs are stored in PostgreSQL; the backfill's frozen selection/enqueue checkpoint is an ignored local JSON manifest. Keep the manifest for batch-specific resume. Individual job recovery does not depend on that file.
- Fixtures are embedded in Python, SQL, component, and browser tests rather than a separate fixtures directory. A pinned disposable PGlite engine runs the SQL suite in CI.
- Title hits retain available author/year metadata as unaccepted candidates. No manual acceptance UI or automatic fuzzy matching is implemented. Source versions remain on the paper; raw provider evidence is retained.
- Access follows the repository's existing shared self-hosted model. Library matching is enforced server-side, but this change does not introduce authentication.

No migration or backfill has been applied to the live database. Production permissions, multi-connection contention, worker deployment, and full-library persistence remain rollout validation. Semantic Scholar and GROBID were not benchmarked; the external-data approval covered only OpenAlex and Crossref.

Validation: 340 backend tests and 401 frontend tests passed; the full frontend suite used `TZ=UTC` for the existing Dashboard fixture's date assumptions. Migration replay and SQL transaction checks passed. The production build passed with the existing bundle-size warning. The citation browser fixture passed. Combined citation/library browser checks passed 13 of 14 tests: the unchanged row-context-menu test timed out opening/clicking its Copy & export submenu and also timed out when rerun alone. No context-menu implementation was changed. A 391-paper dry-run inventory completed without enqueueing jobs.

## PDF fallback development

The existing implementation was committed in seven strategic groups: plan, schema, provider resolution, jobs/import capture, API, UI, and pilot/operations. Development then continued with an optional GROBID adapter and migration 034.

Implemented: credentialed managed-PDF reads, GROBID `processReferences` with consolidation disabled, raw bibliography/TEI evidence, parser versions and content hashes, conservative DOI/arXiv matching, partial-output preservation, explicit API/UI/backfill opt-in, and a read-only PDF pilot command. PDF revision tracking and a content recheck fence results from replaced files even when the URL is unchanged. PDF jobs refresh automatically only for previously opted-in papers. Title-only references remain unresolved.

The user confirmed no GROBID service is available yet. Extraction remains disabled until `GROBID_URL` is configured; no private PDF has been sent to GROBID and no real parser coverage gain is claimed. Semantic Scholar remains unqueried. The next operational step is to configure a self-hosted service and run `pilot_pdf_citations.py` before rolling out PDF extraction.

Validation for this phase: 358 backend tests and 403 frontend tests passed, including parser output, private-storage access, request opt-in, file replacement, evidence display, and missing-service behavior. Both migrations replay successfully and SQL fixtures pass. The citation browser test and production frontend build also passed. The earlier context-menu browser timeout and UTC-dependent Dashboard fixture remain documented above.

## Outcome and scope

Let a user open a paper and see which papers in the current library it cites and which library papers cite it. Each connection must have retrievable evidence, a reliable direction, and an indexing status that distinguishes missing data from a failed lookup.

Milestone 1 delivers persistent OpenAlex identities/references, a resumable indexing worker, local citation matching, API responses, paper-detail lists, and a measured coverage pilot. Milestone 2 captures Crossref references and measures the additional coverage. Milestone 3 evaluates Semantic Scholar and GROBID against the remaining gaps before adding a fallback.

The initial UI is library-scoped. Database-wide analysis can use an explicit authorized scope in the backfill tool. Graph visualization, citation-context highlighting, OCR, and automatic merging of preprint/published records are deferred. Semantic similarity is not citation evidence.

## Design decisions

- Use PostgreSQL tables and transactional functions through the existing Supabase client. No graph database is required.
- Keep citation indexing separate from the capped discovery response in `related_paper_service.py`. Reuse provider request infrastructure only after making it suitable for bulk indexing.
- Resolve exact normalized identifiers automatically. Store title/author/year matches as candidates until validated; never accept the first search result by default. Missing or conflicting identities remain unresolved.
- Resolve the source population before intersecting references with local identities. Keep unresolved references so adding a target paper later can create a link without refetching the source.
- Keep provider assertions distinct from evidence extracted from the actual stored PDF. Preserve version/alias provenance; preprints and published versions can have different bibliographies.
- Use durable database jobs and a separate worker command. FastAPI background tasks may enqueue work, but do not own durable execution.
- An empty provider reference list means no references returned by that provider. It does not establish an empty bibliography.

## Task 1: Define contracts and representative fixtures

Dependencies: none.

Files: create `backend/models/citation.py`, `backend/tests/test_citation_identity.py`, and inline fixtures in the citation test files; update `docs/api/papers.md` with proposed contracts.

- [x] Define typed provider identities, extracted references, evidence, local citation summaries, and job responses using the existing camel-case model convention.
- [x] Define retrieval states (`pending`, `running`, `succeeded`, `partial`, `not_found`, `failed`) separately from identity resolution (`exact`, `candidate`, `ambiguous`, `unresolved`) and staleness.
- [x] Add minimal sanitized fixtures for A citing B, B not returning references, reciprocal A/B links, an arXiv-only source, duplicate local records, and an ambiguous title.
- [x] Specify direction as `citing_paper_id -> cited_paper_id`; require provider/method provenance and last successful indexing time in responses.

Acceptance: contracts represent unavailable references, successful empty retrieval, failed retrieval, unresolved targets, and old usable evidence independently. Tests do not require live provider calls.

## Task 2: Add storage and atomic publication

Dependencies: Task 1.

Files: create `backend/migrations/033_paper_citations.sql` (use the next free number when executing), `backend/services/citation_repository.py`, and `backend/tests/sql/paper_citations.sql`; update `docs/database/schema.md` and the fresh-install schema path after checking migration conventions.

- [x] Add `paper_external_ids`, `paper_reference_runs`, `paper_references`, `paper_citations`, `paper_citation_evidence`, and `paper_citation_jobs`.
- [x] Index provider/external-ID lookup, reference target identifiers, source-paper reference retrieval, job claim/retry fields, and reverse citation lookup. Make `(citing_paper_id, cited_paper_id)` unique and reject self-edges.
- [x] Permit one provider identity to map to multiple local paper copies; retain ambiguity rather than arbitrarily selecting the first copy. Apply library scope when selecting visible targets.
- [x] Record job scope, source fingerprint, attempt count, next retry, lease expiry, and timestamps. Add atomic claim/reclaim functions to prevent competing workers from publishing the same job.
- [x] Stage each provider run and publish its active evidence in one transaction. Fence publication using the job lease/version and current paper fingerprint so stale workers cannot overwrite newer results.
- [x] On successful refresh, replace that provider's active evidence. Keep evidence from other providers. Remove a derived edge only when no active supporting evidence remains.
- [x] Preserve last successful evidence after partial/failed runs; expose the failed refresh separately. Cascade deleted papers' derived records without deleting unrelated evidence.
- [x] Follow the repository's actual access model; validate library scope server-side rather than relying on a caller-supplied ID alone.

Acceptance: SQL checks cover duplicate edges, reversed queries, deletion, independent provider support, failed refresh preservation, successful evidence removal, and stale publication rejection. Run these against a disposable PostgreSQL/Supabase instance; service mocks cannot validate transaction behavior.

## Task 3: Implement identity resolution and OpenAlex retrieval

Dependencies: Tasks 1–2.

Files: create `backend/services/citation_identity_service.py`, `backend/services/openalex_client.py`, `backend/services/citation_service.py`, and `backend/tests/test_citation_service.py`; adjust `related_paper_service.py` only if extracting shared HTTP helpers.

- [x] Canonicalize DOI prefixes/casing and arXiv base identifiers while retaining versions. Support legacy arXiv formats and Unicode-preserving title normalization.
- [x] Resolve sources by identifier; verify any provider location/alias used to connect an arXiv record to a published work. Retain available author/year metadata with title candidates; keep them unaccepted until independently validated.
- [x] Persist accepted identities and unresolved/candidate outcomes. Do not reuse discovery's `return exact or results[0]` behavior.
- [x] Retrieve complete outgoing reference arrays and store provider reference IDs even when no local target exists. Keep provider coverage separate from matching coverage.
- [x] Maintain indexed local identities in PostgreSQL and intersect references in library-scoped SQL. Avoid one database request or remote metadata lookup per reference.
- [x] Bound per-source worker concurrency, honor retry headers, and distinguish authentication, rate-limit, not-found, and transient failures. Batch referenced-work retrieval in the pilot; keep credentials out of logs.

Acceptance: fixtures establish correct direction, no semantic-neighbor edges, no first-search-result matches, no self/known-duplicate-work edges, deterministic duplicate handling, and full reference retrieval without discovery limits. Existing related-paper behavior remains compatible if shared code changes.

## Task 4: Build resumable jobs and reconciliation

Dependencies: Tasks 2–3.

Files: create `backend/services/citation_job_service.py`, `backend/scripts/index_paper_citations.py`, `backend/scripts/citation_worker.py`, and `backend/tests/test_citation_jobs.py`; add a paginated iterator in `backend/services/paper_service.py`.

- [x] Add stable keyset pagination over paper IDs and persist scope/checkpoints. Never use the existing single `list_papers` response as the entire backfill population.
- [x] Register local identifiers first and reconcile retained references whenever a provider identity arrives, independent of processing order. Capture a bounded initial population and use incremental jobs for later imports.
- [x] Define the backfill CLI: required `--library-id` or explicit `--all-libraries`, optional `--limit`, `--dry-run`, and `--resume` with a persisted batch ID. Dry run reports selection and existing state without provider requests or database writes.
- [x] Implement leased jobs with bounded retries, restart recovery, and deterministic idempotency keys. A worker crash must leave a reclaimable job.
- [x] Add per-paper reindex jobs and transactional reconciliation. Identity changes immediately invalidate or hide affected identity-dependent links; a transient provider failure preserves valid older evidence with a stale indicator.
- [x] Enqueue indexing/reconciliation on all paper creation paths, including identifier, BibTeX, direct creation, and agent imports. Connect source/PDF changes and deletions to invalidation. Trace callers so hooks are not limited to one router.
- [x] Keep indexing independent of `auto_note_enabled`. Enqueue atomically with paper creation; failed provider work must not remove the paper. Recover missed captured payloads by refetch and expose indexing failures.

Acceptance: a fixture population larger than a database page is fully processed; stopping/restarting produces the same edges as uninterrupted execution. Importing B after A creates A-to-B from retained references. Repeated imports/reindex requests do not duplicate jobs or evidence.

## Task 5: Expose citation APIs

Dependencies: Tasks 3–4.

Files: create `backend/routers/citations.py` and `backend/tests/test_citation_routes.py`; register the router in `backend/app.py`; update `docs/api/papers.md`.

- [x] Implement `GET /api/papers/{paper_id}/citations?direction=outgoing|incoming&limit=...&offset=...` with deterministic pagination and a total count.
- [x] Include local paper summaries, evidence source/method, last successful index time, latest attempt status, and unresolved-reference counts. Counts must use the same scope as results.
- [x] Implement `POST /api/papers/{paper_id}/citations/reindex` returning HTTP 202 and durable per-provider job summaries, plus `GET /api/citation-jobs/{job_id}` for progress.
- [x] Bind ordinary reads to the source paper's library and verify access to both ends. Do not let a read request trigger provider indexing.
- [x] Match existing not-found/error contracts and keep request/response casing consistent with frontend conventions.

Acceptance: route tests cover direction, pagination, scope isolation, unknown paper/job, repeated reindex requests, and status reporting after failed refresh with previous data. Incoming links are the reverse query over stored edges, not a second inference.

## Task 6: Add paper-detail citation lists

Dependencies: Task 5.

Files: create `frontend/src/components/PaperCitations.jsx` and its test; update `frontend/src/services/api.js`, its tests, and `frontend/src/pages/Paper.jsx`. Evaluate reuse in `PaperInfoPanel.jsx` after the dedicated view works.

- [x] Add “References in this library” and “Cited by in this library” lists with counts, paper navigation, pagination, and source evidence.
- [x] Show indexing progress, last indexed time, stale evidence, unresolved references, and retry controls where relevant. Poll queued/running jobs with cleanup when navigating away.
- [x] Use “Not indexed yet,” “Indexing failed,” and “No indexed citations found” as distinct states. Describe unresolved references as not matched locally, not as proof those works are absent from the database.
- [x] Ignore responses from a previously selected paper/library. Keep related-paper recommendations and their import controls separate.

Acceptance: component tests cover incoming/outgoing navigation, empty versus failed/unindexed states, pagination, refresh with existing data, and navigation during an in-flight request. Keyboard navigation and loading/error states work in a manual browser check.

## Task 7: Validate and roll out the OpenAlex milestone

Dependencies: Tasks 1–6.

Files: add operator instructions in `docs/guides/citation-indexing.md`; create `docs/citation-indexing-pilot-report.md` after the pilot, recording observations rather than predicted coverage.

- [x] Run focused tests as each service ships; run backend/frontend regression suites and the frontend production build when the milestone is integrated.
- [x] Apply the migration in a disposable environment and verify schema installation, atomic publication, worker restart, and a full API/UI flow with fixed fixtures.
- [x] Select a reproducible pilot of up to 30 papers across DOI, arXiv-only, and PDF-only records, using all available records in small strata. Record the actual selection and date; include known positive pairs where available.
- [x] Resolve target identities across the chosen library so a source-only sample does not create artificial coverage gaps. Limit reference retrieval to pilot sources initially.
- [x] Record identity-resolution rate, provider reference availability, local edges, ambiguities, failures, request volume, and runtime separately. Manually compare up to 20 detected edges with bibliographies and check every selected known positive pair. Document denominators and unavailable PDFs.
- [x] Treat every detected false positive as a release blocker until the matching rule is fixed and checked again. Report recall limits explicitly; do not promise complete coverage from this sample.
- [x] Prepare migration/backfill commands, rollback instructions, and the pilot report. Keep worker failure messages free of credentials and full PDF contents.
- [ ] Apply migration 033 (and 034/035 for PDF extraction) to the intended live database, validate permissions and concurrent workers, then start the worker and expand the persisted backfill with resumable batches.
- [x] Document rollback by disabling enqueueing, stopping workers, and hiding the feature while retaining additive tables/evidence. Avoid destructive rollback of indexed data.

Milestone 1 exit: supported citation pairs appear in both directions with inspectable evidence; new imports reconcile; retries and restarts preserve data; coverage limitations are measured and visible.

## Task 8: Capture Crossref references

Dependencies: Task 7.

Files: update `backend/services/import_service.py`; add `backend/services/crossref_reference_service.py` and `backend/tests/test_crossref_references.py`; extend citation integration tests.

- [x] Retain Crossref `reference` records from DOI lookup in an internal payload validated into the typed citation result by the worker. Pass them to citation storage only after a local paper exists; do not insert provider payload fields into the `papers` row.
- [x] Store reference DOI, bibliographic metadata, and raw text when supplied. Treat absent references separately from successful empty data.
- [x] Resolve DOI targets through the identity layer; retain title-only reference metadata unresolved. Add Crossref backfill for existing DOI papers without captured references.
- [x] Reuse the same evidence publication and job lifecycle. Measure additional edges and unresolved references over the pilot baseline; overlapping sources must not double-count an edge.

Milestone 2 exit: DOI imports preserve available references without redundant immediate fetches; Crossref evidence coexists with OpenAlex; coverage improvement is reported.

## Task 9: Evaluate and implement the justified fallback (pending)

Dependencies: Task 8 and measured unresolved cases.

Files: proposed `backend/services/semantic_scholar_client.py` and/or `backend/services/pdf_reference_service.py`, with provider/parser fixture tests and deployment documentation.

- [ ] Evaluate Semantic Scholar on unresolved arXiv/identifier cases. Verify current endpoint fields, pagination, authentication, and limits before implementation.
- [ ] Evaluate GROBID on stored PDFs whose bibliographies are missing from provider results. Read PDFs through the existing managed-storage abstraction, including private GCS objects; do not assume stored URLs are publicly fetchable.
- [x] Extract from original PDF bytes rather than the truncated Markdown cache. Retain document hash/version, parser version, raw bibliography text, and structured identifiers. Use citation context/page coordinates only when supplied by a suitable parser output.
- [x] Report empty or unparseable extraction as partial/failure, preserving old evidence and explaining that scanned PDFs may need OCR. Keep OCR as a separate decision.
- [ ] Compare additional verified local edges, ambiguous matches, failure rate, runtime, and operating requirements. Implement the fallback with demonstrated benefit using the existing jobs/evidence model; record a no-go decision if neither adds sufficient value.

Milestone 3 exit: remaining gaps have measured causes and either an integrated, tested fallback or an explicit evidence-based deferral.

## Verification commands

Run from the repository root after the relevant files exist. Focused tests come first; the full suites below are the integrated milestone gate. SQL transaction checks require the disposable database in Task 2 and are not replaced by pytest mocks.

```powershell
uv run --directory backend pytest tests/test_citation_identity.py tests/test_citation_service.py tests/test_citation_jobs.py tests/test_citation_routes.py
npm --prefix frontend run test:run -- src/components/PaperCitations.test.jsx src/services/api.test.js
uv run --directory backend pytest
npm --prefix frontend run test:run
npm --prefix frontend run build
git diff --check
```

Suggested commit sequence: contracts/schema; provider identity and OpenAlex indexing; durable jobs/reconciliation; citation API; citation UI; pilot/docs; Crossref capture; justified fallback. Keep every implementation checkbox open until its acceptance criteria have been verified.


## Revised fallback decision ? 2026-11-04

The user cannot run GROBID locally and approved proceeding with an existing-dependency fallback. OpenAlex/Crossref remain the primary path; GROBID is optional and disabled unless explicitly configured and selected.

- [x] Add a local PyMuPDF parser for numbered bibliographies; preserve raw text, pages, hash and parser version.
- [x] Match only explicit DOI/arXiv identifiers; retain title-only entries unresolved. Return partial for unsupported layouts and uncertain boundaries.
- [x] Add migration 035, independent local PDF opt-in, worker dispatch, default local API/UI action and local CLI pilot. Preserve GROBID jobs and older batch scopes.
- [x] Run a five-PDF read-only pilot from the previously approved sample plus the known MAGiC-SLAM positive. Review bibliography boundaries and fix appendix/biography contamination before acceptance.
- [x] Record measured results in `docs/local-pdf-citation-pilot-report.md`: three successful and two partial extractions; 203 retained records; zero additional exact local links.
- [ ] Apply migrations to the intended live database and start a bounded provider indexing rollout. No live migration or backfill has been performed in this development session.
- [ ] Consider a separate reviewed title-matching workflow if increased local citation coverage is needed. Do not turn title similarity into automatic citation evidence.

Decision: ship the local fallback as an opt-in aid, with a no-go for automatic library-wide PDF extraction based on this pilot. Defer GROBID/OCR and keep the provider milestone independent of local parser coverage.

Validation for this revision: 372 backend tests and 403 frontend tests passed; migrations 033/034/035 each applied twice in disposable PGlite with lifecycle fixtures; citation browser workflow and production build passed. The build retains the existing large-bundle warning. Live Supabase permissions and concurrent deployment behavior remain rollout checks.


## Installed-schema repair

The user's SQL diagnostic confirmed an earlier revision of 033 is installed: `citation_local_ids` and local identifier seeding are absent, and the paper-change trigger covers INSERT/UPDATE only. This is an upgrade mismatch, not evidence that the user skipped running the complete files. The live database had 391 papers, 264 with identifiers, 12 completed provider jobs, and 243 stored references without local links at diagnosis.

- [x] Prepare additive migration 036 to restore current citation functions, seed local identifiers and reconcile retained references while preserving PDF schema upgrades.
- [x] Simulate the older installation, apply 036 twice, assert that jobs/references/runs and fingerprints survive, then rerun citation and PDF lifecycle checks.
- [ ] User applies 036 through the Supabase SQL editor; verify the resulting live schema and seeded identities.
- [ ] Queue the intended library backfill to resolve additional OpenAlex targets and inspect resulting local links. A repaired schema does not guarantee provider coverage or immediately match references that contain only OpenAlex IDs.
