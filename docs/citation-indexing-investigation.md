# Citation indexing investigation

Investigated November 2, 2026. Scope: repository inspection and provider documentation. No live database audit, provider coverage benchmark, or citation backfill was performed. This is a proposed design, not an implemented feature.

Recommendation: build a persistent directed citation index using OpenAlex first, Crossref reference metadata where available, and PDF bibliography extraction for gaps. Match references against local paper identities and retain evidence for each link. PostgreSQL is sufficient for this feature.

## Existing foundations and gaps

- `backend/services/related_paper_service.py` already resolves papers through OpenAlex and reads `referenced_works`. Its response includes `already_exists` and `existing_paper_id`, so parts of the local matching flow exist.
- This is a discovery feature, not a complete index: `find_related_papers` combines semantic neighbors with citation links, caps fetched candidates at three times the result limit, ranks existing library papers last, and returns at most 30 candidates. Connections between existing papers can disappear from the response.
- `_resolve_seed_work` returns the first title search result when there is no exact title match. That is insufficient evidence for creating a durable citation edge. Even equal titles need disambiguation when identifiers are absent.
- The paper model stores DOI and arXiv ID but no persistent OpenAlex identity. The checked migrations define no paper-to-paper citation table.
- `backend/services/import_service.py::_fetch_doi` already requests Crossref records, but its returned metadata omits reference lists. Capturing these during import could avoid another request.
- `backend/services/dedup_service.py` offers DOI, arXiv, and normalized-title matching. It loads the library for every call; reusing it for each reference would multiply database reads. Its title normalization removes non-ASCII characters, and identifier handling needs stronger canonicalization for this use.
- `backend/services/pdf_text_service.py` truncates cached text at 120,000 characters. Bibliographies near the end can be lost. The upload metadata extractor reads the first three pages and at most 8,000 characters, so it is not a reference extractor.
- Import-time PDF text extraction in `_auto_generate_notes` is conditional on automatic notes being enabled. Reference indexing needs an independent hook.

## Options

| Source | What it supplies | Recommended role | Limitation |
| --- | --- | --- | --- |
| OpenAlex | Outgoing reference IDs in `referenced_works` | First implementation; existing integration | Coverage and matching are incomplete; a missing edge is not proof of no citation |
| Crossref | Deposited reference records, including identifiers or bibliographic fields when supplied | Reuse DOI import responses and supplement coverage | Depends on what is deposited; not every reference has a DOI |
| Semantic Scholar | Reference endpoint and identifier-based paper lookup, including arXiv | Evaluate as a fallback for unresolved records | Additional integration, rate limiting, and coverage evaluation |
| GROBID | Structured bibliography extraction from PDFs, with optional raw citation strings | Recover references from stored PDFs and supply inspectable evidence | Requires a service and reliable PDF extraction; scanned PDFs need a separate OCR path |
| Existing PDF-to-Markdown extraction | Text that may contain a bibliography | Low-cost feasibility experiment | Needs segmentation, complete bibliography text, and validation of parsed entries |

OpenAlex constructs its graph by matching extracted references to indexed works. It explicitly documents missing references and imperfect metadata matches; preserve provider provenance and distinguish provider-reported links from PDF-verified evidence. See [OpenAlex citations](https://help.openalex.org/data/works/citations/).

Crossref documents reference-bearing records and its reference representation in the [REST filters](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/) and [response format](https://github.com/CrossRef/rest-api-doc/blob/master/api_format.md). An absent reference field should be treated as unavailable data.

Semantic Scholar's official [API examples](https://api.semanticscholar.org/api-docs/snippets) show reference retrieval and arXiv identifier lookup. The documentation endpoint returned HTTP 429 during this investigation; pagination and field details should be verified during integration.

GROBID's [`processReferences`](https://grobid.readthedocs.io/en/latest/Grobid-service/#apiprocessreferences) extracts bibliography entries into TEI XML or BibTeX. `includeRawCitations=1` preserves reference text. Full-text processing can additionally support citation context. Prefer a local service for stored PDFs; keep metadata consolidation configurable.

## Proposed data flow

1. Page through all papers in the chosen scope. Build normalized DOI/arXiv lookup maps and persist validated provider identities. The existing unpaginated `list_papers` must not silently define the complete backfill population.
2. Resolve source papers by exact identifiers first. Use title, authors, and publication year together for unresolved candidates; retain ambiguous matches for review. Normalize DOI prefixes and casing, support old and new arXiv formats, and retain version information even when matching by base arXiv ID.
3. Fetch the full provider reference list for every resolved paper. For OpenAlex, intersect outgoing IDs with the local OpenAlex-ID map. Fetching metadata for every external cited work is unnecessary just to find local connections.
4. Supplement missing coverage with Crossref, then evaluate Semantic Scholar and PDF extraction based on measured gaps. For PDF evidence, preserve the original reference string and document version or file hash. Do not use truncated LLM context as the authoritative bibliography.
5. Resolve reference targets by exact identifiers. Title/author/year matches remain candidates until validated; do not invent a numeric confidence score without calibration. Preprint and published versions may be related without having identical bibliographies, so retain aliases and evidence of version equivalence.
6. Persist directed edges: `A -> B` means A cites B. Query the same table in reverse for "Cited by in this library." Reciprocal citation means both edges exist; it should not be inferred from a single edge.
7. Reconcile unresolved references when new papers arrive. Schedule refresh when identifiers or PDFs change, and support a resumable backfill plus per-paper reindexing.

Semantic similarity and note wiki-links are separate relationships. Neither establishes that one paper cites another.

## Suggested storage

| Table | Purpose and key fields |
| --- | --- |
| `paper_external_ids` | Local paper, provider, external ID, resolution method/status, resolved timestamp; index `(provider, external_id)` and preserve multiple local copies |
| `paper_reference_runs` | Source paper, provider/parser version, source fingerprint, status, retrieved count, timestamps, retry/error information |
| `paper_references` | Run, stable provider reference key or reference fingerprint, target identifiers, raw bibliography text/metadata, resolution status; retain references without a local target |
| `paper_citations` | Unique `(citing_paper_id, cited_paper_id)`; foreign keys to papers and reverse index on `cited_paper_id` |
| `paper_citation_evidence` | Citation edge linked to one or more reference records, matching method, review status; allows providers to support the same edge independently |

Use foreign keys, reject edges from a paper to itself, and exclude links between known duplicate representations of the same work. Preserve ambiguous targets instead of selecting the first duplicate. Scope results explicitly: default to the current library, and make database-wide analysis an explicit scope that respects the caller's access. A provider ID may map to several library copies, so it must not be globally unique across local papers.

Publish refreshed evidence atomically after successful indexing. Failed or partial runs must not erase prior good evidence. Track `pending`, `running`, `succeeded`, `partial`, `not_found`, and `failed` separately; successful provider retrieval does not imply a complete bibliography. Report local resolved citations, unresolved references, and indexing status separately.

## Implementation sequence and validation

Start with provider identity persistence, reference/evidence tables, a separate citation service, and a resumable OpenAlex backfill. Add outgoing/incoming citation API responses and simple paper-detail lists before building a graph visualization. Capture Crossref references during DOI import next. Add PDF processing where the coverage pilot demonstrates value.

Use a persistent job record or queue for bulk work, bounded concurrency, provider-aware retries, and idempotent writes. Existing FastAPI background tasks can launch small jobs but are not durable across restarts. OpenAlex supports [batch ID retrieval](https://help.openalex.org/how-to/api-recipes/); use it where helpful and configure `OPENALEX_API_KEY` for bulk access according to the current [authentication documentation](https://help.openalex.org/api/authentication/). Avoid hard-coding historical quotas.

Before estimating full-library coverage, run a stratified sample containing DOI papers, arXiv-only papers, and PDF-only imports. Report identity resolution rate, reference availability, local edges found, ambiguous matches, and provider failures separately. Manually inspect sampled edges against bibliographies and check known positive pairs to estimate missed citations. This investigation has not measured those rates or identified actual citing pairs in the live database.

Implementation tests should cover citation direction, DOI/arXiv normalization, ambiguous titles, version aliases, duplicate library copies, missing references versus failed retrieval, pagination beyond database/provider page limits, retry/resume behavior, and reindexing without duplicate or lost evidence. The most important product wording is "No indexed citations found" rather than "These papers do not cite each other."
