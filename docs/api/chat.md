# Chat (Copilot) API

The copilot system provides AI-powered chat for individual items (papers, websites, GitHub repos) and library-level and project-level Notes Copilots.

---

## Item Copilot Endpoints

### Paper Chat

| Method | Path | Description |
|---|---|---|
| GET | `/api/papers/{id}/chat` | List chat history for a paper |
| POST | `/api/papers/{id}/chat` | Send a message to the paper copilot |
| DELETE | `/api/papers/{id}/chat` | Clear chat history for a paper |

### Website Chat

| Method | Path | Description |
|---|---|---|
| GET | `/api/websites/{id}/chat` | List chat history for a website |
| POST | `/api/websites/{id}/chat` | Send a message to the website copilot |
| DELETE | `/api/websites/{id}/chat` | Clear chat history for a website |

### GitHub Repo Chat

| Method | Path | Description |
|---|---|---|
| GET | `/api/github-repos/{id}/chat` | List chat history for a repo |
| POST | `/api/github-repos/{id}/chat` | Send a message to the repo copilot |
| DELETE | `/api/github-repos/{id}/chat` | Clear chat history for a repo |

---

## Sending a Message

`POST /api/{item-type}/{id}/chat`

Request body (`ChatMessageCreate`):

```json
{
  "content": "What are the main contributions of this paper?",
  "context": "<p>Optional single note content for context</p>",
  "notesContext": [
    {
      "id": "n_abc123",
      "name": "Summary",
      "type": "file",
      "parentId": null,
      "content": "<p>...</p>"
    }
  ]
}
```

- `content`: the user's message (required)
- `context`: optional single-note HTML string — injected into the system prompt
- `notesContext`: optional array of notes to include as context (supports multi-note context from the tiptap Notes panel)

The assistant response uses OpenAI tool calling to optionally produce note edit/create suggestions.

Returns the assistant `ChatMessage` at `201`:

```json
{
  "id": "cm_abc123",
  "paperId": "p_xyz789",
  "websiteId": null,
  "githubRepoId": null,
  "libraryId": null,
  "role": "assistant",
  "content": "The main contributions are...",
  "suggestions": [
    {
      "id": "sug_abc123",
      "type": "edit",
      "noteId": "n_abc123",
      "noteName": "Summary",
      "parentId": null,
      "content": "<p>Updated summary...</p>",
      "description": "Update summary with main contributions",
      "status": "pending"
    }
  ],
  "createdAt": "2024-03-15T10:42:01Z"
}
```

---

## Note Suggestions

When the assistant identifies relevant note edits or new notes to create, it includes them in the `suggestions` array of the response.

Each suggestion is a `NoteSuggestion`:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique suggestion ID |
| `type` | string | `"edit"` (modify existing note) or `"create"` (create new note) |
| `noteId` | string/null | ID of the note to edit (null for `"create"` type) |
| `noteName` | string | Name of the target note |
| `parentId` | string/null | Parent note ID (for `"create"` type) |
| `content` | string | Proposed HTML content |
| `description` | string | Human-readable description of the change |
| `status` | string | `"pending"`, `"accepted"`, or `"rejected"` |

The frontend renders these as diff cards — the user accepts or rejects each suggestion. Accepted suggestions call `PATCH /api/notes/{id}` (for edits) or `POST /api/{scope}/{scope_id}/notes` (for creates).

---

## Notes Copilot (Library-Level)

| Method | Path | Description |
|---|---|---|
| GET | `/api/libraries/{id}/notes-copilot` | List copilot history for a library |
| POST | `/api/libraries/{id}/notes-copilot` | Send a message to the library notes copilot |
| DELETE | `/api/libraries/{id}/notes-copilot` | Clear copilot history |

### POST /api/libraries/{id}/notes-copilot

The library-level copilot is context-aware: the user can `@mention` any library item (papers, websites, repos, the library itself). The model can call internal tools (`read_note`, `list_item_notes`) to read notes before generating a response.

Request body (`NotesCopilotMessageCreate`):

```json
{
  "content": "Summarize the key themes across the RAG papers.",
  "contextItems": [
    {
      "type": "paper",
      "id": "p_abc123",
      "name": "Attention Is All You Need",
      "metadata": {
        "title": "Attention Is All You Need",
        "abstract": "...",
        "year": 2017
      },
      "notes": [
        { "id": "n_abc", "name": "Summary", "type": "file", "parentId": null, "content": "<p>...</p>" }
      ],
      "includePdf": false
    }
  ],
  "history": [
    { "role": "user", "content": "What papers are about RAG?" },
    { "role": "assistant", "content": "The following papers..." }
  ]
}
```

Valid `contextItem.type` values: `"paper"`, `"website"`, `"github_repo"`, `"library"`, `"project"`, `"experiment"`.

When `includePdf: true` on a paper context item, the full extracted PDF text is injected into the system prompt.

Returns a `ChatMessage` object with optional `suggestions`.

---

## Project Notes Copilot

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects/{id}/notes-copilot` | List copilot history for a project |
| POST | `/api/projects/{id}/notes-copilot` | Send a message to the project notes copilot |
| DELETE | `/api/projects/{id}/notes-copilot` | Clear copilot history |

### POST /api/projects/{id}/notes-copilot

Similar to the library copilot but scoped to a project. Supports experiment context items with structured `config`, `metrics`, and `children` metadata.

Request body (`ProjectNotesCopilotMessageCreate`):

```json
{
  "content": "Compare the performance of these two experiments.",
  "contextItems": [
    {
      "type": "experiment",
      "id": "exp_abc",
      "name": "BM25 Baseline",
      "metadata": {
        "config": { "retriever": "bm25", "top_k": 10 },
        "metrics": { "recall@10": 0.72 },
        "children": []
      },
      "notes": []
    }
  ],
  "history": []
}
```

Returns a `ChatMessage` object with optional `suggestions`.

---

## ChatMessage Object Shape

```json
{
  "id": "cm_abc123",
  "paperId": "p_xyz789",
  "websiteId": null,
  "githubRepoId": null,
  "libraryId": null,
  "projectId": null,
  "role": "assistant",
  "content": "The paper introduces the Transformer architecture...",
  "suggestions": null,
  "createdAt": "2024-03-15T10:42:01Z"
}
```

`role` is either `"user"` or `"assistant"`. `suggestions` is non-null only on assistant messages that include note proposals.
