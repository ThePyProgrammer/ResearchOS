# AI Copilot System

The AI copilot provides contextual chat for individual items (papers, websites, GitHub repos) and for project/library-wide notes. All copilot services use OpenAI tool calling to optionally produce note suggestions alongside conversational replies.

## Shared Tool Definitions

All copilot services expose two output tools to the model:

| Tool | Description |
|------|-------------|
| `suggest_note_edit` | Suggest a complete replacement of an existing note's content. Parameters: `note_id`, `note_name`, `content` (full HTML), `description` (1-2 sentences). |
| `suggest_note_create` | Suggest creating a new note file. Parameters: `note_name`, `parent_id` (nullable), `content` (HTML), `description`. |

When the model calls one of these tools, the service parses the arguments and returns a suggestion dict:

```python
{
  "id": "sug_<8hex>",
  "status": "pending",
  "type": "edit" | "create",
  "noteId": "...",       # edit only
  "noteName": "...",
  "content": "<p>...</p>",
  "description": "..."
}
```

Suggestions are persisted in the `suggestions` JSONB column of the `chat_messages` table alongside the assistant message.

## Paper Chat (`chat_service.py`)

**File:** `backend/services/chat_service.py`

**API:** `POST /api/papers/:id/chat`

### Context injection

Each completion call builds a message list:
1. System prompt (`PAPER_CHAT` from `agents/prompts.py`)
2. System message with paper context: title, abstract, and (if available) full PDF text extracted via `pdf_text_service.extract_and_cache()`
3. System message with notes filesystem: `[folder]/[file]` tree with note content up to 2000 chars per note
4. Last 20 conversation turns

### Behavior

Single-turn (no agentic loop): one `chat.completions.create()` call with tools. The response is either a text reply, one or more tool calls, or both. `_process_tool_calls()` extracts suggestions. If the model only calls tools with no text, a summary sentence is generated automatically ("Here are my suggestions: 2 edits and 1 new file.").

## Website Chat (`chat_service.py`)

**API:** `POST /api/websites/:id/chat`

Same structure as paper chat. Context includes: title, URL, authors, description. No PDF text injection. Notes filesystem injected in the same format.

## GitHub Repo Chat (`chat_service.py`)

**API:** `POST /api/github-repos/:id/chat`

Context includes: owner/repo name, title, URL, language, topics, star count, abstract (from CITATION.cff) or description. Notes filesystem injected.

## Library Notes Copilot

**Service:** `backend/services/notes_copilot_service.py` (library-scoped variant)

**API:** `GET/POST/DELETE /api/libraries/:id/notes-copilot`

The library copilot adds an `@`-mention context system. The request body includes:

```json
{
  "content": "user message",
  "contextItems": [...],
  "history": [{"role": "user", "content": "..."}, ...]
}
```

`contextItems` are items the user selected via `@` in the frontend. Each item has `id`, `type`, `name`, optional `metadata`, and optional `notes` (the item's notes tree with content). The backend builds a context block from these items and injects it as a system message.

This service uses the same single-turn pattern as the item copilots.

## Project Notes Copilot

**File:** `backend/services/project_notes_copilot_service.py`

**API:** `GET/POST/DELETE /api/projects/:id/notes-copilot`

This is the most capable copilot variant. It runs an **agentic loop** with internal read tools in addition to the output tools.

### Additional Tools

| Tool | Description |
|------|-------------|
| `read_note` | Read the full HTML content of a note by ID. The model calls this before suggesting an edit to know current content. |
| `list_item_notes` | List the notes tree for any item type (paper, website, github_repo, library, project, experiment). |

### Agentic Loop

The service loops up to `_MAX_ITERATIONS = 6` times:

1. Call `chat.completions.create()` with all four tools.
2. If the response has no tool calls, stop.
3. If it has tool calls, process each:
   - `suggest_note_edit` / `suggest_note_create`: add to `all_suggestions`, return confirmation text.
   - `read_note` / `list_item_notes`: execute the read, return data as a tool result message.
4. If only output tools were called (no internal tools), continue to next iteration.
5. If only internal tools were called, continue looping (the model needs the data to proceed).

### Intent Follow-Up Pass

After the main loop, if the model produced text describing an intent ("I'll create a note...") but called no tools, a follow-up turn is sent:

> "You described what you would do but didn't call any tool. Please call suggest_note_create or suggest_note_edit now."

This recovers cases where the model hallucinates the action without executing it.

### Plain-Text Recovery Pass

If the loop produces neither text nor suggestions (e.g., the model only called output tools and the first turn was empty), a final call is made without tools to get a plain-text response.

### Experiment Context

The project copilot supports `experiment` type context items. Experiment metadata includes: status, config key-value pairs (up to 20), metrics key-value pairs (up to 20), and a summary of child experiments (up to 10 children with name, status, and top 3 metrics).

### PDF Text Inclusion

When a context item has `include_pdf: true`, the service calls `pdf_text_service.extract_and_cache()` and appends the PDF text (truncated at 15,000 chars) to the item's context block.

### Persistence

Chat history is stored in `chat_messages` with a `project_id` column (added in migration `020_project_notes_copilot.sql`). The service degrades gracefully if the column is missing: history is not persisted between page reloads but the agentic response still works.

## Suggestion Flow (Frontend)

1. Assistant message arrives with `suggestions` array.
2. `CopilotPanel` or `NotesCopilotPanel` renders inline suggestion cards below the message bubble.
3. Each card shows: type badge (Edit / New Note), note name, description, and diff view (for edits) or preview (for creates).
4. Diff view uses a simple line-based LCS diff on stripped HTML text.
5. Accepting an edit calls `notesApi.update(noteId, { content })` and invokes `onNoteUpdated`.
6. Accepting a create calls the appropriate `notesApi.createFor*()` based on `targetType` and invokes `onNoteCreated`.
7. Rejecting marks the suggestion card as rejected with a strikethrough.
