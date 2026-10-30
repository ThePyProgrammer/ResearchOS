# Notes API

Notes implement a file-tree system. Each entry is a `file` (with HTML content), a `canvas` (with JSON Canvas content), or a `folder`. Notes belong to exactly one parent scope.

---

## Scopes

| Scope | Path prefix |
|---|---|
| Paper | `/api/papers/{id}/notes` |
| Website | `/api/websites/{id}/notes` |
| GitHub repo | `/api/github-repos/{id}/notes` |
| Project | `/api/projects/{id}/notes` |
| Experiment | `/api/experiments/{id}/notes` |
| Library (Notes page) | `/api/libraries/{id}/notes` |

---

## Endpoints by Scope

### Paper Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/papers/{id}/notes` | List all notes for a paper |
| POST | `/api/papers/{id}/notes` | Create a note for a paper |
| POST | `/api/papers/{id}/notes/generate` | AI-generate notes for a paper |

### Website Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/websites/{id}/notes` | List all notes for a website |
| POST | `/api/websites/{id}/notes` | Create a note for a website |
| POST | `/api/websites/{id}/notes/generate` | AI-generate notes for a website |

### GitHub Repo Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/github-repos/{id}/notes` | List all notes for a repo |
| POST | `/api/github-repos/{id}/notes` | Create a note for a repo |
| POST | `/api/github-repos/{id}/notes/generate` | AI-generate notes for a repo |

### Project Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/notes` | List all notes for a project |
| POST | `/api/projects/{id}/notes` | Create a note for a project |

### Experiment Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/experiments/{id}/notes` | List all notes for an experiment |
| POST | `/api/experiments/{id}/notes` | Create a note for an experiment |

### Library Notes

| Method | Path | Description |
|---|---|---|
| GET | `/api/libraries/{id}/notes` | List all notes for a library |
| POST | `/api/libraries/{id}/notes` | Create a note for a library |

---

## Shared Operations

| Method | Path | Description |
|---|---|---|
| PATCH | `/api/notes/{id}` | Update a note |
| DELETE | `/api/notes/{id}` | Delete a note |

---

## Create Note

`POST /api/{scope}/{scope_id}/notes`

Request body (`NoteCreate`):

```json
{
  "name": "Summary",
  "parentId": null,
  "type": "file",
  "content": "<p>Key findings: ...</p>"
}
```

- `type`: `"file"`, `"folder"`, or `"canvas"`. Folders have empty `content`.
- `parentId`: ID of parent note (folder) for nested structure; `null` for root-level.
- `content`: HTML string for files, a serialized JSON Canvas 1.0 object for canvases, or an empty string for folders.

Returns the created Note at `201`.

### Canvas documents

The same creation endpoint works in every scope:

```json
{
  "name": "Research map.canvas",
  "parentId": null,
  "type": "canvas",
  "content": "{\"nodes\":[],\"edges\":[]}"
}
```

Omitting canvas content initializes empty `nodes` and `edges` arrays. Creation and rename append `.canvas` if absent. Save using `PATCH /api/notes/{id}` with the serialized document in `content`. The type of an existing entry is not changed by PATCH.

Canvas creation and content updates validate JSON Canvas node types, geometry, unique IDs, colors, file subpaths, and connection endpoints. Invalid content returns `422` before any database write. Unknown extension fields are retained. Existing HTML note behavior is unchanged. No database migration is needed: the existing `notes.type` and `notes.content` columns store the document.

ResearchOS-created file nodes retain their portable `file` path and add `researchos.noteId` for stable references across renames and moves. Local attachments may include `researchos.mediaData` or `researchos.textContent`; group backgrounds may include `researchos.backgroundData`. These optional extensions do not alter the JSON Canvas schema. See [Canvas guide](../canvas.md) for exports and interoperability.

---

## Update Note

`PATCH /api/notes/{id}`

Request body (`NoteUpdate`). All fields optional:

```json
{
  "name": "Updated Summary",
  "content": "<p>Revised findings: ...</p>",
  "isPinned": true
}
```

The `NoteUpdate` model also supports reassigning a note to a different scope (moving a note between parents):

```json
{
  "paperId": null,
  "libraryId": "lib_abc123"
}
```

Only one scope field should be set at a time.

---

## AI Note Generation

`POST /api/papers/{id}/notes/generate`

`POST /api/websites/{id}/notes/generate`

`POST /api/github-repos/{id}/notes/generate`

Request body:

```json
{
  "libraryId": "lib_default"
}
```

Generates a multi-file AI note structure using OpenAI (JSON mode). Creates an "AI Notes" root folder containing 3–8 focused note files. Deletes any existing "AI Notes" folder and legacy "AI Overview" notes before regenerating.

The note structure adapts to content type:
- Math-heavy papers → "Key Equations" file
- Systems papers → "Architecture" file
- Surveys → "Taxonomy" file

Returns an array of all created Note objects at `201`. Returns `503` if the OpenAI key is missing.

---

## Note Object Shape

```json
{
  "id": "n_abc123",
  "paperId": "p_xyz789",
  "websiteId": null,
  "githubRepoId": null,
  "libraryId": null,
  "projectId": null,
  "experimentId": null,
  "name": "Summary",
  "parentId": null,
  "type": "file",
  "content": "<p>Key findings: ...</p>",
  "isPinned": false,
  "createdAt": "2024-03-15T10:00:00Z",
  "updatedAt": "2024-03-15T10:30:00Z"
}
```

Exactly one of `paperId`, `websiteId`, `githubRepoId`, `libraryId`, `projectId`, `experimentId` will be non-null, identifying the scope.

---

## Libraries and Collections API (brief)

### Libraries

| Method | Path | Description |
|---|---|---|
| GET | `/api/libraries` | List all libraries |
| POST | `/api/libraries` | Create a library |
| PATCH | `/api/libraries/{id}` | Update a library |
| DELETE | `/api/libraries/{id}` | Delete a library |

`LibraryUpdate` fields: `name`, `description`, `autoNoteEnabled`, `autoNotePrompt`.

### Collections

| Method | Path | Description |
|---|---|---|
| GET | `/api/collections` | List collections |
| POST | `/api/collections` | Create a collection |
| GET | `/api/collections/{id}` | Get a collection |
| PATCH | `/api/collections/{id}` | Update a collection |
| DELETE | `/api/collections/{id}` | Delete a collection |
| GET | `/api/collections/{id}/top-authors` | Get top authors in a collection |

Query param `library_id` filters the list. `paper_count` is computed (not stored).

`GET /api/collections/{id}/top-authors` accepts an optional `limit` query param (default 10). Returns top authors ranked by paper count across papers and websites in that collection.
