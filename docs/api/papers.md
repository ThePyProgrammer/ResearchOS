# Papers API

All endpoints are prefixed with `/api/papers`.

---

## Core CRUD

| Method | Path | Description |
|---|---|---|
| GET | `/api/papers` | List papers |
| POST | `/api/papers` | Create a paper manually |
| GET | `/api/papers/{id}` | Get a single paper |
| PATCH | `/api/papers/{id}` | Update a paper |
| DELETE | `/api/papers/{id}` | Delete a paper |

### GET /api/papers

Query parameters:

| Parameter | Type | Description |
|---|---|---|
| `collection_id` | string | Filter by collection membership |
| `status` | string | Filter by status (`inbox`, `to-read`, `read`) |
| `search` | string | Text search on title/authors |
| `library_id` | string | Filter by library |

Returns an array of Paper objects.

### POST /api/papers

Optional query parameter: `?check_duplicates=true`

When `check_duplicates=true`, the server runs deduplication before creating. If a duplicate is found, returns `409` with:

```json
{
  "duplicates": [
    {
      "paper": { ... },
      "confidence": "exact",
      "matchField": "doi"
    }
  ],
  "paper": { ... }
}
```

Request body (`PaperCreate`):

```json
{
  "title": "Attention Is All You Need",
  "authors": ["Vaswani, A.", "Shazeer, N."],
  "year": 2017,
  "publishedDate": "2017-06-12",
  "venue": "NeurIPS",
  "doi": "10.48550/arXiv.1706.03762",
  "arxivId": "1706.03762",
  "status": "inbox",
  "tags": ["transformers"],
  "abstract": "...",
  "source": "human",
  "pdfUrl": null,
  "libraryId": "lib_default"
}
```

Returns the created Paper at `201`.

### PATCH /api/papers/{id}

Partial update. All fields are optional. Uses `exclude_unset=True` semantics — only provided fields are updated.

Request body (`PaperUpdate`): any subset of Paper fields.

---

## Import

### POST /api/papers/import

Resolve a DOI, arXiv ID, or URL to paper metadata and add it to the library.

Resolution logic:
- DOI → Crossref Works API
- arXiv ID → arXiv Atom API
- URL → arXiv/doi.org sniff, then OpenReview/Zenodo/HTML meta extraction

Runs three-tier dedup (DOI, arXiv ID, normalized title) before creating. If a duplicate is found, returns `200` with the existing paper plus `"alreadyExists": true`.

Request body:

```json
{
  "identifier": "1706.03762",
  "libraryId": "lib_default"
}
```

Response on new paper (`201`):

```json
{
  "id": "p_abc123",
  "title": "Attention Is All You Need",
  "alreadyExists": false,
  ...
}
```

Response on duplicate (`200`):

```json
{
  "id": "p_existing",
  "title": "Attention Is All You Need",
  "alreadyExists": true,
  "duplicates": [{ "paper": {...}, "confidence": "exact", "matchField": "doi" }]
}
```

After creation, if the paper has a `pdf_url`, a background task auto-downloads the PDF to Supabase Storage. If the library has `auto_note_enabled`, AI notes are generated in the background.

---

## BibTeX Import (Two-Phase)

### POST /api/papers/import-bibtex/parse

Phase 1: parse a `.bib` file and return a preview with duplicate detection.

Request: `multipart/form-data` with:
- `file`: the `.bib` file
- `library_id` (optional query param): restrict dedup scope to a library

Response: array of entry objects:

```json
[
  {
    "key": "vaswani2017attention",
    "paper": { "title": "...", "authors": [...], ... },
    "duplicate": false,
    "duplicateId": null,
    "duplicateConfidence": null,
    "duplicateMatchField": null,
    "error": null
  }
]
```

Duplicate entries have `"duplicate": true`, `"duplicateId"`, `"duplicateConfidence"` (`"exact"` or `"likely"`), and `"duplicateMatchField"` (`"doi"`, `"arxiv_id"`, or `"title"`).

### POST /api/papers/import-bibtex/confirm

Phase 2: create papers from confirmed BibTeX entries (after user review).

Request body:

```json
{
  "entries": [ { "title": "...", "authors": [...], ... } ],
  "libraryId": "lib_default"
}
```

Performs intra-batch dedup to skip entries that match papers created earlier in the same import. For arXiv entries, re-resolves via the arXiv API for richer metadata and PDF URL.

Response (`201`): array of result objects, each with a `"status"` field:
- `"created"` — paper was created; full paper object included
- `"skipped"` — duplicate detected; `"reason"` and `"duplicateId"` included
- `"failed"` — parse/create error; `"error"` included

After creation, PDF download and AI note generation are queued as background tasks.

---

## BibTeX Export

### GET /api/papers/export-bibtex

Export papers and websites as a downloadable `.bib` file.

Query parameters (use one):

| Parameter | Description |
|---|---|
| `ids` | Comma-separated paper/website/repo IDs (e.g., `p_abc,w_def,gh_xyz`) |
| `library_id` | Export all items in a library |
| `collection_id` | Export all items in a collection |

Returns `Content-Type: application/x-bibtex` with `Content-Disposition: attachment; filename="researchos-export.bib"`.

Papers become `@article` or `@inproceedings` entries. Websites become `@misc`.

---

## PDF Upload and Management

### POST /api/papers/{id}/pdf

Upload a PDF file for a paper.

Request: `multipart/form-data` with field `file` (must be `application/pdf` or `application/octet-stream`).

Stores the PDF in Supabase Storage at `{paper_id}.pdf`, updates `papers.pdf_url` to the public storage URL, then queues AI note generation as a background task.

Returns the updated Paper object.

### DELETE /api/papers/{id}/pdf

Remove the paper's PDF from Supabase Storage, clear `pdf_url`, and delete any cached extracted text.

Returns `204 No Content`.

### POST /api/papers/{id}/pdf/fetch

Download the paper's existing external `pdf_url` into Supabase Storage.

Use this for papers imported via DOI/arXiv where the PDF URL was set but not yet downloaded. Returns `422` if the paper has no `pdf_url` or the PDF is already in storage.

Returns the updated Paper object.

---

## PDF Text Extraction

### GET /api/papers/{id}/text

Return cached extraction metadata (not the full text):

```json
{
  "paperId": "p_abc123",
  "pageCount": 12,
  "extractedAt": "2024-03-15T10:42:01Z",
  "charCount": 45032
}
```

Returns `{ "paperId": "...", "pageCount": null, "extractedAt": null, "charCount": 0 }` if not yet extracted.

### POST /api/papers/{id}/text

Extract and cache text from the paper's PDF. Uses `pymupdf4llm` to produce Markdown. Returns the same metadata shape as `GET /api/papers/{id}/text`.

---

## PDF Metadata Extraction

### POST /api/papers/extract-metadata

Extract metadata (title, authors, date, venue, abstract, DOI) from an uploaded PDF using LLM.

Request: `multipart/form-data` with field `file`.

Response:

```json
{
  "title": "Extracted Title",
  "authors": ["Author One", "Author Two"],
  "year": 2023,
  "publishedDate": "2023-06-15",
  "venue": "NeurIPS",
  "doi": "10.1234/example",
  "abstract": "..."
}
```

Used by the frontend QuickAdd Upload mode to pre-fill the form.

---

## Related Papers

### GET /api/papers/{id}/related

Find related papers using Semantic Scholar or other scholarly APIs.

Query parameters:

| Parameter | Default | Description |
|---|---|---|
| `limit` | 12 | Number of results (1–30) |

Returns a structured related papers result object.

---

## Author Linking

### GET /api/papers/{id}/authors

List structured author links for a paper. Returns an array of `{link, author}` objects.

### POST /api/papers/{id}/authors/link

Link a structured author record to this paper.

Request body:

```json
{
  "authorId": "a_xyz789",
  "position": 0,
  "rawName": "Vaswani, A."
}
```

Returns the created `PaperAuthor` link at `201`. Returns `409` if the author is already linked.

### DELETE /api/papers/{id}/authors/link/{author_id}

Unlink a structured author from this paper. Returns `204`.

---

## Notes and Chat

See [notes.md](notes.md) for paper note endpoints and [chat.md](chat.md) for paper chat endpoints.

Paper notes: `GET/POST /api/papers/{id}/notes`, `POST /api/papers/{id}/notes/generate`

Paper chat: `GET/POST/DELETE /api/papers/{id}/chat`

---

## Paper Object Shape

```json
{
  "id": "p_abc123",
  "title": "Attention Is All You Need",
  "authors": ["Vaswani, A.", "Shazeer, N."],
  "year": 2017,
  "publishedDate": "2017-06-12",
  "venue": "NeurIPS",
  "doi": "10.48550/arXiv.1706.03762",
  "arxivId": "1706.03762",
  "status": "inbox",
  "tags": ["transformers", "attention"],
  "abstract": "...",
  "source": "human",
  "agentRun": null,
  "relevanceScore": null,
  "agentReasoning": null,
  "rejected": false,
  "collections": ["c_ml"],
  "pdfUrl": "https://.../storage/v1/object/public/pdfs/p_abc123.pdf",
  "githubUrl": null,
  "websiteUrl": null,
  "links": [{ "name": "Project Page", "url": "https://..." }],
  "libraryId": "lib_default",
  "createdAt": "2024-03-15T10:00:00Z",
  "itemType": "paper"
}
```
