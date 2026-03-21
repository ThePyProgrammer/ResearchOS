# Import Pipeline

## Overview

The paper import pipeline resolves an identifier (DOI, arXiv ID, or URL) into structured metadata, deduplicates against the existing library, creates the paper record, and then runs background tasks for PDF download and AI note generation.

**Entry points:**
- Backend service: `backend/services/import_service.py`
- Router: `backend/routers/papers.py` — `POST /api/papers/import`
- Frontend: `Header.jsx` QuickAdd modal (Import mode)

---

## Stage 1: Identifier Detection

**Function:** `import_service.detect_type(identifier) -> (type, canonical_value)`

Classification rules (evaluated in order):

| Pattern | Type | Canonical value |
|---------|------|----------------|
| Contains `doi.org/` | `doi` | Bare DOI after `doi.org/` |
| Matches `arxiv.org/abs/` or `arxiv.org/pdf/` | `arxiv` | Bare arXiv ID, version stripped |
| Starts with `10.` and contains `/` | `doi` | The identifier as-is |
| Starts with `doi:` | `doi` | After stripping the prefix |
| Matches `^\d{4}\.\d{4,5}(v\d+)?$` | `arxiv` | Version suffix stripped |
| Starts with `http://` or `https://` | `url` | The URL as-is |
| Otherwise | — | `ValueError` with user-facing message |

The frontend `Header.jsx` mirrors this logic in the `detectType()` utility (`frontend/src/utils/detectType.js`) to show a live badge (DOI / arXiv / URL / GitHub) as the user types.

---

## Stage 2: Metadata Resolution

### DOI → Crossref Works API

`_fetch_doi(doi)` calls `https://api.crossref.org/works/<doi>` with a polite User-Agent header (`mailto:researchos@localhost`).

Fields extracted: title, authors (`"Family, Given"` format), year, `published_date` (YYYY-MM-DD), venue (container-title or publisher), DOI, abstract (JATS XML tags stripped).

### arXiv ID → Atom API

`_fetch_arxiv(arxiv_id)` calls `https://export.arxiv.org/api/query?id_list=<id>` and parses the Atom XML.

Fields extracted: title, authors, year, `published_date`, venue (`"arXiv"`), arXiv ID, abstract, `pdf_url` (from `<link type="application/pdf">`).

### URL → Sniff and Extract

`_fetch_url(url)` applies a resolution cascade:

1. If the URL matches `arxiv.org/abs/` or `arxiv.org/pdf/` → delegate to `_fetch_arxiv`.
2. If the URL contains `doi.org/` → delegate to `_fetch_doi`.
3. If the URL matches `openreview.net/forum?id=` or `openreview.net/pdf?id=` → delegate to `_fetch_openreview`.
4. If the URL matches `zenodo.org/records/<id>` → delegate to `_fetch_zenodo`.
5. Fetch the HTML page. Search the page content for embedded arXiv URLs or DOIs; if found, re-delegate.
6. Extract `<meta>` tags: `citation_*`, `dc.*`, and OpenGraph (`og:*`) properties.
7. If a clean DOI is found in meta tags, re-resolve via Crossref.
8. Fall back to the `<title>` tag as a minimal paper entry.

### OpenReview → API v2 with v1 Fallback

`_fetch_openreview(note_id)` tries `https://api2.openreview.net/notes?id=<note_id>` first, then falls back to `https://api.openreview.net/notes?id=<note_id>` for older papers. Both API versions use different content formats (v2 wraps values in `{"value": ...}`, v1 uses bare values); `_parse_openreview_note()` handles both.

### Zenodo → REST API

`_fetch_zenodo(record_id)` calls `https://zenodo.org/api/records/<id>`. Extracts title, creators, description (HTML stripped), publication date, DOI, and venue from journal or resource type. PDF is not auto-downloaded for Zenodo records.

---

## Stage 3: Duplicate Detection

**Function:** `dedup_service.find_duplicates(paper_data)`

Three-tier matching in order:

| Tier | Match Field | Confidence |
|------|-------------|------------|
| 1 | DOI (case-insensitive) | `exact` |
| 2 | arXiv ID | `exact` |
| 3 | Normalized title (lowercase, strip punctuation, collapse whitespace, min 10 chars) | `likely` |

If a match is found, the router returns the existing paper with a `duplicates` array describing the match:

```json
{
  "paper": { ... existing paper ... },
  "duplicates": [{"paper": {...}, "confidence": "exact", "matchField": "doi"}]
}
```

The frontend surfaces a warning with match details and an "Import anyway" option.

---

## Stage 4: Paper Creation

`paper_service.create_paper(PaperCreate(...))` inserts the paper with `status="inbox"`. The `source` field is set to `"import"` for user-initiated imports and `"agent"` for agent-created papers.

---

## Stage 5: Background Tasks

Two tasks run concurrently after paper creation (via FastAPI `BackgroundTasks`):

### PDF Auto-Download

If `pdf_url` is set on the created paper (common for arXiv papers):

1. Download the PDF via HTTP.
2. Validate: check for `%PDF-` magic bytes or `application/pdf` content-type.
3. Upload to Supabase Storage at `pdfs/{paper_id}.pdf` via `pdf_service.upload_pdf()`.
4. Update `paper.pdf_url` to the Supabase public URL.

For papers imported before auto-download existed, `POST /api/papers/:id/pdf/fetch` triggers this manually.

### AI Note Generation

If the library has `auto_note_enabled = True`:

1. Extract PDF text (if `pdf_url` set) via `pdf_text_service.extract_and_cache()`.
2. Call `note_service.generate_notes()` which uses OpenAI JSON mode (`gpt-4o-mini`, `response_format=json_object`) to produce a structured note tree.
3. The LLM returns a `notes` array where each entry has `name`, `type` (file/folder), `content` (HTML for files), and optional `children`.
4. Creates an "AI Notes" root folder containing 3-8 focused note files.
5. Previous "AI Notes" folders and legacy "AI Overview" notes are deleted before regeneration.

The note structure adapts to content type: math-heavy papers include "Key Equations", systems papers include "Architecture", surveys include "Taxonomy".

---

## GitHub Repo Import

**Function:** `import_service.resolve_github_repo(url)`

Separate from the paper import pipeline. Calls `https://api.github.com/repos/<owner>/<repo>` and optionally fetches `CITATION.cff` for richer metadata (title, authors, DOI, version, abstract).

**Router:** `POST /api/github-repos/import`

---

## Website Import

**Function:** `import_service.resolve_url_as_website(url)`

Refuses arXiv URLs and `doi.org` URLs (instructs user to use paper import instead). Extracts title, description, authors, and published date from OpenGraph, Twitter, and article meta tags.

**Router:** `POST /api/websites/import`

---

## BibTeX Import

A separate two-phase pipeline for bulk import:

1. **Parse** (`POST /api/papers/import-bibtex/parse`): `bibtex_service.parse_bibtex_file()` uses bibtexparser v2 with `LatexDecodingMiddleware`. Each entry is mapped to a `PaperCreate` and run through duplicate detection. Returns a preview list with `duplicate`, `duplicateConfidence`, and `duplicateMatchField` per entry.

2. **Confirm** (`POST /api/papers/import-bibtex/confirm`): Creates papers for the selected entries. For arXiv entries (identified by `arxiv_id` in the BibTeX), re-resolves via `_fetch_arxiv()` for richer metadata. Performs intra-batch dedup to skip entries that duplicate papers created earlier in the same batch. Queues background PDF download and auto-notes.
