# Paper PDF migration record

October 29, 2026. Project: `researchos-513104`. Bucket: `researchos-papers`.

## Result

215 referenced paper PDFs (1,677,272,162 bytes, about 1.56 GiB) were copied from
Supabase `pdfs` to GCS with their existing object names. Each copied file was read
back and verified by size and SHA-256 against its exact GCS generation. Resumed
transfers reused previously hashed generations only after confirming the source
fingerprint, destination generation, size, and recorded hash were unchanged.

The 215 `papers.pdf_url` values now use permanent URLs under
`https://storage.googleapis.com/researchos-papers/`. All 360 paper IDs were
preserved. A complete comparison against the pre-cutover paper-row backup
confirmed that every other paper field remained unchanged. There are zero
remaining Supabase PDF URL references in `papers`.

Eight external arXiv URLs and 137 papers without a PDF URL were left unchanged.
Ten unreferenced Supabase PDF objects were left in place for separate review.
Notes, cached extracted text, chat, authors, projects, and relationships remain
in Supabase. A read-only audit found no embedded legacy PDF URLs in note or chat
content that needed rewriting.

## Application and bucket configuration

- `backend/.env` selects `PAPER_STORAGE_PROVIDER=gcs`,
  `GCS_PROJECT_ID=researchos-513104`, and `GCS_PDF_BUCKET=researchos-papers`.
  This file stays ignored by Git. Start/restart the normal backend to load it.
- PDFs are publicly readable. Bucket IAM grants `allUsers` Storage Object Viewer
  and grants `researchos-pdfs@researchos-513104.iam.gserviceaccount.com` Storage
  Object User. Local migration/testing used the existing user ADC credentials.
- The bucket retains US multi-region placement, Standard storage, uniform access,
  and seven-day soft delete. CORS covers the local development/test origins in
  `backend/config/gcs-pdf-cors.json`.
- The backend handles new uploads, replacement, imports/fetching, and deletion
  through the configured PDF service. Deletion recognizes the file's actual
  managed location instead of relying on the new-upload provider.
- API responses expose `hasStoredPdf`; library badges, filters, counts, and bulk
  skip logic use it. Replacing a PDF invalidates cached extracted text.

The unrelated services occupying ports 8000 and 5173 were not stopped or changed.
Temporary ResearchOS validation services used ports 8011 and 5174; they are not a
production deployment or a change to the default Vite proxy configuration.

## Validation

- 292 backend tests passed.
- 16 migration-tool tests passed, covering pagination, source scoping, resume,
  concurrent edits, guarded rollback, and source cleanup selection.
- 363 frontend tests passed in UTC. An existing dashboard calendar test assumes
  UTC and fails in the machine's local timezone; its implementation was not changed.
- The production frontend build passed.
- Live checks created and then removed temporary validation papers and GCS objects.
  Uploads, generation-guarded replacement, public downloads, CORS, Range responses,
  cache-miss text extraction, cache invalidation, PDF removal, whole-paper removal,
  and bulk removal passed.
- A real Edge browser fetched a migrated PDF from GCS, rendered its Blob URL in
  the application's PDF viewer, verified browser CORS/Range access, and checked
  the live API URL and stored-PDF flag.

## Recovery and quota cleanup

All 225 original Supabase PDFs remain available during recovery. Therefore the
old Supabase object-storage usage has **not yet decreased**. No source deletion
is scheduled or performed automatically.

The source cleanup dry run identified exactly 215 eligible objects totaling
1,677,272,162 bytes, with no skipped conflicts. The seven-day window ends
**November 5, 2026, at 14:03:54 UTC**. At that point, review and run the cleanup
workflow in the [migration runbook](paper-storage-gcs-migration-plan.md). If no
other changes occur, the ten unreferenced source objects would account for about
29.6 MiB afterward. Changed/replaced/deleted papers are retained for review rather
than blindly deleted from the old bucket.

The ignored `backend/data/migration/` directory contains:

- `pre-copy-inventory.json`: the reconciled source inventory.
- `copy-journal.jsonl`: object mappings, generations, source markers, sizes, hashes,
  and copy/verification results.
- `url-cutover-backup.json`: all original paper rows and the verified URL mapping.
- `url-cutover-journal.jsonl`: pending/confirmed compare-and-set URL writes.
- `cutover-verification.json`: final metadata, ID, object-count, and byte checks.
- `legacy-link-audit.json`: the note/chat link audit.
- `browser-smoke-result.json` and `gcs-paper-preview.png`: browser validation evidence.

Keep these artifacts until recovery and source cleanup are complete. Guarded
rollback is provided by `backend/scripts/switch_paper_urls.py --rollback`; the
runbook explains write pausing and why newer/replaced GCS files need separate
reconciliation. Do not simply run the old application against GCS URLs.
