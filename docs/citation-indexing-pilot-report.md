# Citation indexing pilot — November 3, 2026

The approved read-only pilot found one within-library citation pair, verified in the source PDF: **MAGiC-SLAM: Multi-Agent Gaussian Globally Consistent SLAM cites SplaTAM: Splat, Track & Map 3D Gaussians for Dense RGB-D SLAM**. Page 9, bibliography entry [15], names the target. OpenAlex reported the edge from `W4413157515` to `W4402698355`.

No migration, backfill, or other live-database write was performed. This pilot used the new provider clients and local matching, not production citation tables.

## Population and sample

The inventory contained 391 paper rows in seven libraries: 31 DOI-bearing, 233 additional arXiv-only, 10 PDF-only without DOI/arXiv, and 117 other metadata-only records. Four DOI records also have arXiv IDs, giving 237 arXiv-bearing records overall. There were 254 PDF URLs; availability of every PDF was not checked.

The sample selected the first ten stable paper IDs in each DOI, arXiv-only, and PDF-only group: 30 sources total. This is a deterministic feasibility sample, not a random estimate of database coverage. Metadata-only records were excluded. Targets were matched against all 391 rows, restricting both ends to the same library.

| Group | Sources | Exact OpenAlex identities | OpenAlex sources with nonempty references | OpenAlex reference records | Crossref reference records |
| --- | ---: | ---: | ---: | ---: | ---: |
| DOI | 10 | 8 | 7 | 269 | 460 |
| arXiv only | 10 | 10 | 1 | 38 | 0 |
| PDF only | 10 | 0 | 0 | 0 | 0 |

OpenAlex retrieved records for 18 sources and found no identifier-verified match for 12. Ten of the successful responses had empty reference arrays (one DOI source and nine arXiv-only sources). Crossref returned references for nine DOI sources; one DOI was not found. The remaining twenty sources had no DOI and caused no Crossref network requests. The 460 Crossref references are provider records, not 460 additional unique citations.

The run made 56 HTTP requests in 80.2 seconds, without provider errors. Referenced-work identity retrieval completed. No OpenAlex key was configured; this does not establish a safe unauthenticated bulk quota.

## Local edges and verification

One unique local pair was detected, supported by OpenAlex. Crossref added no local pairs in this sample, although it supplied references for two DOI sources that OpenAlex did not resolve. Crossref DOI references can still miss targets stored only as arXiv records without a verified DOI alias.

Source paper `p_0246e188` cites target `p_28219176`. The source PDF was read from its existing configured GCS object and inspected using PyMuPDF; entry [15] confirms the target title and authors. This verifies one edge, not a general precision estimate. There was no independently curated set of known positive pairs, so recall was not estimated.

Sample IDs, metadata, references, candidates, and the detected edge are preserved in ignored `backend/data/citations/pilot-2026-11-03.json`. The verification PDF is ignored at `backend/data/citations/p_0246e188.pdf`. These working artifacts are not committed.

## Implications

Provider-only coverage is inadequate for much of this collection. All ten sampled arXiv papers resolved to identities, but nine supplied no references. Successful retrieval must remain distinct from bibliography completeness in API/UI wording.

PDF-only records need identifier enrichment, bibliography extraction, or reviewed identity matching. The resolver deliberately does not promote title-only results to citation evidence.

GROBID is the next recommended evaluation for stored PDF bibliographies, but no GROBID service or parser benchmark was configured during this work. Semantic Scholar was not queried with library metadata: the pilot approval covered OpenAlex and Crossref. These fallbacks, OCR, and automated PDF verification remain follow-up work, not completed features.

## Validation and rollout boundaries

Migration 033 was applied twice in disposable PGlite PostgreSQL. Transaction fixtures verified direction, late identities, library scope, evidence preservation/replacement, duplicates, stale leases, source edits, reciprocal links, and deletion. Backend and frontend suites, the production build, and the citation browser fixture passed; final counts are tracked in the execution plan.

Final counts: 340 backend tests and 401 frontend tests passed. The combined citation/library browser run passed 13 of 14 tests, including the citation test. The unchanged row-context-menu test timed out opening/clicking its Copy & export submenu, including on an isolated rerun; that implementation was not modified here.

The full frontend suite requires `TZ=UTC` for the unchanged Dashboard chart test, whose UTC-midnight fixtures otherwise group into the preceding local date. Citation tests pass in the local timezone as well.

After the pilot, a tested resolver improvement was added: an identifier-verified OpenAlex work can contribute a unique missing DOI/arXiv alias. Multiple possible aliases remain unaccepted. The pilot was not rerun for this improvement, so the observed edge count above is unchanged and does not predict alias-enriched coverage.

Production multi-connection contention, Supabase role behavior, worker deployment, and the persisted full-library backfill remain rollout checks. This pilot establishes feasibility and coverage gaps; it is not deployment completion.
