# Paper PDF migration: Supabase Storage to Google Cloud Storage

Prepared October 29, 2026. Repository inspection and current official documentation inform this plan. **The 215-file transfer, application integration, and database URL cutover are complete.** All paper IDs and other paper fields were verified unchanged. Source cleanup remains deferred through the seven-day recovery window. See the [migration record](paper-storage-gcs-migration-report.md) for results and evidence. Earlier setup/pilot notes below are retained as historical context. Billing was not inspected; the user confirmed this checkout is the only ResearchOS instance.

## Setup progress and next command

Inventory review: 360 visible paper rows, 225 PDF objects totaling 1,708,328,065 bytes (about 1.59 GiB), 215 managed references, no missing sources or shared keys, and 10 unreferenced objects. The eight external/unrecognized URLs are all on `arxiv.org`. Leave the unreferenced files and external URLs untouched pending separate review. The runtime service account's bucket-level Object User grant was subsequently confirmed.

A copy-and-verify tool is available at `backend/scripts/copy_paper_storage.py`. It defaults to a dry run selecting three referenced PDFs (smallest, median, largest). It checks source metadata and the paper's current reference, streams source bytes to a temporary file, creates destination objects with a no-overwrite precondition, reads back the exact GCS generation, compares SHA-256 and sizes, and appends results to ignored `backend/data/migration/copy-journal.jsonl`. On reruns it verifies existing objects rather than overwriting them; a conflicting destination stops the run. It does not update database URLs, delete source files, or change bucket access. Failed copies may leave destination objects for inspection. No automatic source cleanup is provided.

```powershell
# Dry-run pilot selection (no dependency installation required beyond Python)
uv run --no-project python backend/scripts/copy_paper_storage.py

# Copy and verify the pilot; uses local ADC and backend/.env
uv run --no-project --with supabase --with python-dotenv --with google-cloud-storage --with httpx python backend/scripts/copy_paper_storage.py --execute
```

The pilot completed successfully: all three selected PDFs, totaling 53,331,920 bytes, were copied and verified by size and SHA-256 against the exact GCS generation. The source files and database URLs remain unchanged, and the bucket remains private. Results are recorded in the pilot journal. `--limit 0` selects all referenced PDFs, but use a fresh reconciled inventory and finish the application integration/cutover preparation before switching production URLs. The tool is a copy/verification building block, not the complete URL migration or cleanup workflow described below. It uses the current local ADC user; it does not impersonate the runtime service account.

Read-only cloud inspection on October 29 confirmed project `researchos-513104` / bucket `researchos-papers`: Standard storage, **US multi-region**, uniform bucket-level access, enforced public access prevention, and seven-day soft delete. US multi-region differs from the proposed single-region setup; confirm the location/cost choice before copying. The inspected bucket IAM policy has no explicit binding for `researchos-pdfs@researchos-513104.iam.gserviceaccount.com`; project-level inheritance has not been checked. No cloud settings were changed.

To grant the planned bucket-level runtime access using your provisioning identity:

```powershell
gcloud storage buckets add-iam-policy-binding gs://researchos-papers --project=researchos-513104 --member="serviceAccount:researchos-pdfs@researchos-513104.iam.gserviceaccount.com" --role=roles/storage.objectUser
```

The read-only inventory script is now available. Set `SUPABASE_URL` and `SUPABASE_KEY` in your shell or in ignored `backend/.env`, using credentials that can see all intended paper rows and bucket objects. Do not commit or paste secrets. Run from the repository root:

```powershell
uv run --no-project --with supabase --with python-dotenv python backend/scripts/inventory_paper_storage.py
```

It reads paginated paper metadata and recursively paginated storage listings, then writes `backend/data/migration/paper-inventory.json` (ignored by Git). It does not download PDFs, change URLs, or write/delete cloud objects. Existing reports are not overwritten; use `--output` for another snapshot. Review missing sources, shared references, unreferenced objects, and external/unrecognized URLs before preparing a copy manifest. Listings reflect credential visibility and are not a transactional snapshot.

Local verification:

```powershell
uv run --no-project python -m unittest discover -s backend/scripts -p "test_inventory_paper_storage.py"
```

## Recommended scope and design

### Implemented operations

The repository now includes GCS upload/delete support, API-derived `hasStoredPdf`,
provider-independent library filters and controls, replacement cache invalidation,
and managed-file cleanup for single/bulk paper deletion. No schema migration is
needed. Local GCS configuration lives in ignored `backend/.env`; credentials stay
outside frontend code. CORS configuration is in `backend/config/gcs-pdf-cors.json`.

Operational commands below run from the repository root after `uv sync --locked`
in `backend`. All reports/backups/journals are in ignored `backend/data/migration`.

```powershell
# Copy/verify all referenced PDFs, resuming immutable generations already hashed
uv run --directory backend python scripts/copy_paper_storage.py --inventory data/migration/pre-copy-inventory.json --limit 0 --workers 4 --execute

# Validate the URL plan without writing database rows
uv run --directory backend python scripts/switch_paper_urls.py

# Pause API writes, then apply guarded URL changes
New-Item -ItemType File -Path backend/data/migration/maintenance.flag
uv run --directory backend python scripts/switch_paper_urls.py --execute
Remove-Item -LiteralPath backend/data/migration/maintenance.flag

# Inspect source cleanup eligibility (read-only)
uv run --directory backend python scripts/cleanup_source_pdfs.py
```

`switch_paper_urls.py` backs up all paper rows and the verified mapping before the
first database write. It checks source fingerprints, destination generations,
sizes and recorded SHA-256 metadata, current URL values, and newly added source
references. Each compare-and-set URL update is durably journaled. Failures leave
the write-pause marker in place for inspection; do not remove it blindly or run
an old version of the app against a partially migrated database.

For guarded rollback, pause writes and run
`uv run --directory backend python scripts/switch_paper_urls.py --rollback --execute`.
Rollback refuses changed/deleted sources, edited paper URLs, and replaced GCS
objects. Keep the new code so any newer GCS-only papers remain usable. If changing
the new-write provider back to Supabase, edit `PAPER_STORAGE_PROVIDER` locally and
restart the backend; switching that setting does not move newer GCS files back.

For source cleanup, first review the dry-run report. The destructive command
`uv run --directory backend python scripts/cleanup_source_pdfs.py --execute`
requires both an API write-pause marker and expiration of the seven-day recovery
window recorded in `url-cutover-backup.json`. Remove the marker afterward. It
deletes only unchanged verified source objects whose paper still points to the
matching unchanged GCS generation, never unrelated/orphaned files. Changed or
deleted papers are retained for manual review. No source deletion is scheduled or
performed automatically, and storage quota is not reclaimed until cleanup runs.

Local live integration validation is available through
`uv run --directory backend python scripts/smoke_gcs_storage.py --execute`.
It creates temporary validation papers, verifies upload/replacement, anonymous
downloads/CORS/ranges, cache-miss extraction and cache invalidation, and single/bulk
deletion, then removes its temporary database rows and live GCS objects. It does
not enter the application lifespan, so unrelated startup seed writes do not run.

Move only managed paper PDF bytes from Supabase's `pdfs` bucket to one dedicated Google Cloud Storage (GCS) bucket. Keep the Supabase database, paper metadata, notes, extracted text, authors, projects, libraries, and other application data where they are.

Preserve `papers.id` and object names (`p_12345678.pdf`). Change `papers.pdf_url` only when it references a verified PDF in this project's Supabase `pdfs` bucket. External arXiv/publisher URLs and null values stay as they are. This is a storage migration, not a paper re-import.

For the smallest migration, preserve the app's existing public PDF access behavior using permanent GCS HTTPS URLs. This makes every migrated PDF publicly readable; bucket-level Object Viewer also permits object listing. If PDFs include private manuscripts or you want private access, use the private variant below before cutover. Start the new bucket private while copying regardless of the final access choice.

A global provider setting controls new writes; each existing PDF's location controls reads and deletes during transition. A provider switch alone must never decide where an existing file is deleted.

## What the code actually does today

| Location | Finding and implication |
| --- | --- |
| `backend/services/pdf_service.py` | Uses bucket `pdfs`, object name `{paper_id}.pdf`, uploads via the Supabase SDK, returns a public URL. Replacement currently deletes before uploading. |
| `backend/models/paper.py`, `backend/services/paper_service.py` | `pdf_url` is an optional string. IDs are generated separately as `p_` plus eight UUID hex characters. No storage-object ID is persisted in the Paper model. |
| `backend/routers/papers.py` | Manual upload, DOI/arXiv imports, BibTeX imports, and fetch-to-storage use the PDF service. Fetch rejects already stored PDFs using a hardcoded Supabase URL substring. |
| `frontend/src/pages/Library.jsx` | The same substring drives stored-PDF badges/actions, bulk-download skip decisions, filters, and counts. All of these need updating. |
| `frontend/src/pages/Paper.jsx` | Fetches `pdfUrl` into a Blob and falls back to direct display. Direct GCS fetch needs CORS configuration. |
| `frontend/src/pages/LibraryNotes.jsx` | Embeds paper PDF URLs in an iframe. Validate this separately from the paper page. |
| `backend/services/pdf_text_service.py` | Downloads PDF URLs with HTTP and caches extraction in Supabase `paper_texts`. Permanent public GCS URLs preserve that contract. |
| `backend/services/bibtex_service.py`, `map_service.py`, copilot services | Consume or export PDF URLs. Keep their URLs usable and audit persisted copies of old URLs. |
| `backend/services/paper_service.py` | Deleting an entire paper currently deletes its database row without removing its PDF. Inventory orphaned files and address managed-file cleanup in the storage integration. |
| `backend/pyproject.toml`, `backend/uv.lock` | Python/FastAPI with uv and Supabase SDK; add the GCS Python library and update the lockfile. |
| `docs/deployment.md`, `backend/app.py` | Documented as local/single user, without application authentication. The actual deployment location still needs confirming. |

No paper ID, DOI, arXiv ID, library ID, note foreign key, or project relationship needs changing. Supabase `storage.objects.id` values do not transfer to GCS. GCS identifies objects by bucket/name and assigns generation numbers for versions; record those in the migration journal, not as replacement paper IDs.

Example mapping:

```text
paper ID: p_ab12cd34                         -> unchanged
object key: p_ab12cd34.pdf                  -> unchanged
old URL: https://PROJECT.supabase.co/storage/v1/object/public/pdfs/p_ab12cd34.pdf
new URL: https://storage.googleapis.com/BUCKET/p_ab12cd34.pdf
```

## Phase 1: inventory, backup, and cost check

I will prepare an inventory command that reads all pages of database rows and all pages/prefixes of objects in `pdfs`. Do not use the current unpaginated application list endpoint as a migration inventory.

It will report file count, total bytes, largest file, source object metadata, matching paper IDs, missing source objects, objects without a paper row, duplicate/shared URL references, and URLs pointing to unexpected projects/buckets. Nonstandard paths must be preserved and mapped explicitly rather than inferred from filenames.

Save a protected export of the affected paper rows and a manifest containing paper ID, original URL, source key/size/update marker, destination key, destination generation, SHA-256, copy status, verification status, URL-update status, and errors. Keep data and journals outside tracked source files. Unmatched/orphan files receive a separate review list; do not silently attach, delete, or mix them with unrelated storage.

Check the Supabase usage dashboard to distinguish object-storage quota from database disk or bandwidth limits. Moving PDFs solves object-storage growth; it does not reduce database usage from extracted text. Check whether existing quota enforcement currently permits downloads.

Estimate destination storage, operations, internet delivery to browsers/backend, temporary duplicate storage, soft-deleted bytes, and one-time Supabase outbound transfer. A final dollar estimate needs actual bytes, chosen region, and monthly read volume. Billing alerts are useful but are not hard spending caps. References: [GCS pricing](https://cloud.google.com/storage/pricing), [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

## Phase 2: create the GCS bucket and credentials

1. Select/create a Google Cloud project, attach billing, and ensure the Cloud Storage API is enabled. Set budget alerts.
2. Choose a globally unique bucket name, for example `researchos-papers-PROJECT-prod`; avoid identifying/personal information in the name.
3. Choose a single region close to the actual backend/users and consistent with data residency needs. Do not infer a region from the user's timezone. Use Standard storage initially; avoid cold classes and automatic archival until access patterns justify them.
4. Enable uniform bucket-level access. Start with public access prevention enabled. Use Google-managed encryption, no retention lock, and no automatic deletion lifecycle. Explicitly retain seven days of soft delete for recovery; account for its storage cost.
5. Create a dedicated backend service account. Grant `roles/storage.objectUser` on this bucket, rather than project-wide Storage Admin. Use a separately authorized provisioning identity for bucket/IAM changes. The migration identity needs source read access, destination object access, and narrowly scoped paper-row update access.
6. Use Application Default Credentials locally. On Google Cloud, use an attached service account; elsewhere prefer Workload Identity Federation if supported. A service-account JSON file is a fallback in a secret store, never committed or sent to the frontend. Existing Supabase credentials remain necessary for the database.

PowerShell template, to be run later with real values and an authorized provisioning identity:

```powershell
$paperProject = 'YOUR_PROJECT_ID'
$paperBucket = 'YOUR_GLOBALLY_UNIQUE_BUCKET'
$paperRegion = 'YOUR_CHOSEN_REGION'
gcloud auth login
gcloud config set project $paperProject
gcloud services enable storage.googleapis.com
gcloud storage buckets create "gs://$paperBucket" --project=$paperProject --location=$paperRegion --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=7d
gcloud iam service-accounts create researchos-pdfs --project=$paperProject
$paperServiceAccount = "researchos-pdfs@$paperProject.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$paperBucket" --member="serviceAccount:$paperServiceAccount" --role=roles/storage.objectUser
gcloud auth application-default login
```

CLI login and ADC login serve different clients. The local ADC identity must also have the necessary bucket permissions; creating a runtime service account does not automatically make local code use it.

References: [bucket setup](https://docs.cloud.google.com/storage/docs/creating-buckets), [CLI options](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/create), [authentication](https://docs.cloud.google.com/storage/docs/authentication), [soft delete](https://docs.cloud.google.com/storage/docs/soft-delete).

For public-access parity, after the bucket contents are reviewed, remove bucket-level public access prevention and grant `allUsers` Object Viewer on this dedicated PDF bucket. An inherited organization policy can still prohibit public access; do not work around it by exposing credentials. Use the private variant if public access is disallowed or unwanted. [Public access setup](https://docs.cloud.google.com/storage/docs/access-control/making-data-public).

Configure browser CORS with the actual development and production frontend origins, including `http://localhost:5173` and `http://127.0.0.1:5173` if used:

```json
[
  {
    "origin": ["http://localhost:5173", "http://127.0.0.1:5173", "https://YOUR_APP_DOMAIN"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "maxAgeSeconds": 3600
  }
]
```

Save as `cors.json` and apply with `gcloud storage buckets update "gs://$paperBucket" --cors-file=cors.json`. Validate Range requests/preflights in the browser. CORS controls browser cross-origin access; it does not make public PDFs private. [CORS examples](https://docs.cloud.google.com/storage/docs/cors-configurations).

## Phase 3: prepare the code before moving production references

I will implement and test these changes while the running app still uses Supabase PDFs:

- Add a cached GCS client and storage adapter behind `pdf_service.py`. Proposed configuration: `PAPER_STORAGE_PROVIDER=supabase|gcs`, `GCS_PROJECT_ID`, `GCS_PDF_BUCKET`, and an explicit allowlist of legacy Supabase PDF bucket origins. Preserve current upload/delete entry points where practical; delete should receive the existing managed location.
- Keep `{paper_id}.pdf` names. Set `Content-Type: application/pdf`, inline disposition, and a short cache lifetime or revalidation so replacing a PDF does not keep showing old bytes.
- Replace delete-before-upload with atomic object replacement. Use generation preconditions for concurrent GCS mutations; report storage failures rather than clearing a database reference after a failed deletion. Handle upload-success/database-failure through a retry/reconciliation journal because storage and Postgres cannot share a transaction.
- Add one backend managed-location classifier that parses and validates the URL host, bucket, and key. Recognize this project's legacy Supabase location and configured GCS bucket, rather than matching arbitrary URL substrings.
- Expose a derived `hasStoredPdf` API field consistently across paper responses and generic item/batch responses. It means the record references an app-managed location, not that a fresh existence check has run. Use it throughout `Library.jsx` in place of hardcoded Supabase URL checks. No database column is required for this derived value.
- Update the PDF fetch route to reject already managed GCS PDFs too. Manual upload, automatic imports, BibTeX, and bulk fetching must all write through the same adapter.
- After auto-download, reload the paper's stored PDF URL before extraction; the current task continues passing the original external URL. Keep existing extracted-text caches during a byte-identical migration; invalidate/rebuild them when a PDF is actually replaced.
- Validate Paper/LibraryNotes previews, direct open/download, BibTeX export, map links, and copilot extraction. Audit persisted JSON/rich-text/export references to exact legacy PDF URLs; update affected copies deliberately. Existing downloaded exports cannot be rewritten, so old links will stop working after source cleanup unless a separate compatibility service is provided.
- Ensure both PDF deletion and whole-paper/bulk deletion use managed-file cleanup without deleting arbitrary external URLs. During transition, suppress fallback resurrection of deleted/replaced files.
- Update dependencies, environment examples, deployment instructions, storage docs, and fresh-install setup so new GCS installations do not require a Supabase PDF bucket. Keep historical migrations intact.

## Phase 4: copy and verify

I will provide a resumable Python migration command with separate `inventory`, `copy`, `verify`, `apply-urls`, `rollback-urls`, and `cleanup-source` modes. Default behavior is dry-run; mutating modes require explicit invocation. No phase automatically deletes source files.

Use the existing Supabase Storage SDK to download only inventoried PDF objects and the GCS SDK to upload them. Stream or spool to bounded temporary files instead of holding the whole collection in memory. Supabase also supports S3-compatible tooling for larger transfers, but a manifest-driven Python tool fits this codebase and coordinates database changes more directly. [Supabase listing](https://supabase.com/docs/reference/python/storage-from-list), [S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility).

For every object:

1. Read source metadata and download the exact source bytes; calculate SHA-256 and confirm the source marker did not change during the read.
2. Upload with no-overwrite preconditions initially. On resume, skip only if the existing destination is verified to match. A mismatch stops for review rather than silently overwriting.
3. Set PDF content metadata and record the GCS generation. Use SDK integrity checks and read back the destination to compare SHA-256 and byte count; do not assume cross-provider ETags are comparable checksums.
4. Persist status after each object and retry transient failures with bounded backoff/concurrency. Failed verification blocks that row's URL update.

First copy a small pilot including a large PDF and a normal uploaded/imported PDF. Then copy the full manifest. Files can be copied while the app runs, but this is only the initial pass: final reconciliation must handle replacements and deletions as well as new uploads.

## Phase 5: cutover after transfer

For this single-user app, use a brief paper-mutation maintenance window instead of adding a complex dual-write system.

1. Pause PDF uploads, imports, fetches, replacements, PDF deletion, whole-paper deletion, and other writes affecting the migration set. Drain background jobs and prevent old workers from writing.
2. Re-inventory, reconcile additions/changes/deletions, and run the final copy/verification. A file deleted since inventory must not be resurrected. Keep reads available if practical.
3. Deploy the prepared code with new-write provider still `supabase`; it must understand both URL types. Keep mutations paused.
4. Enable and verify the selected GCS serving mode. For public parity, fetch actual HTTPS URLs without Google login and validate CORS.
5. Apply URL updates only for verified manifest entries. Each update must compare both paper ID and the expected old URL; mismatches become conflicts. Use transactional batches or a database migration function and journal every committed result. Never run a global string replacement across arbitrary URLs.
6. Switch `PAPER_STORAGE_PROVIDER=gcs`, restart all workers, run smoke checks, and resume writes. New uploads now go directly to GCS.
7. Reconcile final counts, total bytes, verification results, paper-ID sets, and managed URL locations. Every intended active source reference must now resolve to a verified GCS object, with explicit exceptions reported.

Do not use generic API PATCH operations that retrigger imports/AI work for the migration. Byte-identical copies need no new paper rows, embeddings, notes, or extracted text.

## Validation and rollback

Before source cleanup, require: no unexplained missing/mismatched PDFs; unchanged paper IDs and relationships; correct stored-PDF filters/counts; successful manual upload and replacement; single/bulk fetching and imports; paper and notes-page previews; open/download; cache-miss text extraction and chat; PDF removal; whole-paper removal; unchanged external/null URLs; and no GCS credentials in browser bundles.

Run targeted backend tests for adapter behavior, managed-location detection, routing, failures, and migration resume/conflict handling; run the existing backend suite, frontend tests, and production frontend build. Include real-bucket browser smoke checks because mocked SDK tests cannot prove IAM or CORS.

Keep source objects for a short agreed recovery interval, such as seven days, if the current quota permits. If quota pressure requires earlier cleanup, keep a verified independent backup before deletion.

Rollback is journal-driven, not a blind provider flip. Pause mutations again; restore an old URL only if the row still equals the exact migrated URL and its unchanged source object is intact. Files newly uploaded or replaced in GCS after cutover must stay on GCS with compatible code, or be verified and copied back before a full rollback. Do not undo user deletions. Reconcile writes since cutover before choosing which code/configuration to restore.

After successful validation and the recovery interval, produce an exact cleanup allowlist. Delete only confirmed superseded source objects through the Supabase Storage API, in batches; do not delete `storage.objects` rows with SQL, which leaves file bytes behind. Review unmatched objects separately. Old replacements/deletions must be accounted for so stale source bytes are not left consuming the quota. Keep the manifest and final report. [Supabase deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects).

## Private-bucket alternative

Keep public access prevention enforced. Persist provider/bucket/object key as storage metadata, separately from the external source URL, and expose a stable backend PDF endpoint that redirects authorized requests to short-lived signed GCS URLs or streams bytes. Never persist signed URLs in `papers.pdf_url`; they expire. Internal extraction should download through the SDK, and iframe links need a stable resolver rather than cached signed URLs.

This requires schema/model/API changes and access control suited to the actual deployment. The current unauthenticated app cannot make PDFs private to a user merely by hiding the bucket. Keyless signing also needs an appropriate signing identity and `signBlob` permissions; ADC authentication alone is not sufficient for all signing configurations. [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls).

## Inputs needed for execution

- Google Cloud project, billing setup, bucket name, and chosen region.
- Actual backend hosting location and frontend origins.
- Public-access parity or private-PDF access.
- Supabase project/bucket access and a secure way to supply migration credentials.
- Inventory results and an acceptable brief maintenance/recovery window.

Deliverables I will produce during implementation: the storage integration, managed-PDF API/UI changes, resumable transfer and URL/rollback tooling, tests, configuration/runbook updates, and a per-file verification/cutover report. Account login/billing and credentials must come from the account owner; secrets belong in local environment/secret management, not this document or chat.
