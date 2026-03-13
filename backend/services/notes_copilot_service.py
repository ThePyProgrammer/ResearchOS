"""
Notes-page AI Copilot service.

Provides a library-scoped, multi-item chat that can:
  • reference any papers / websites / GitHub repos (and their notes) selected via @
  • run an agentic loop: read notes → reason → propose note edits/creates
  • propose notes to any item in the library or to the library-level notes tree

Persistence:
  Chat history is stored in the `chat_messages` table using the library_id column.

  Required Supabase migration (run once):
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS library_id text
      REFERENCES libraries(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_chat_messages_library_id
      ON chat_messages (library_id);

  If the column does not exist the service degrades gracefully: the agentic
  response is still generated and returned, but message history won't persist
  across page reloads.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from agents.llm import get_model, get_openai_client, completion_params
from agents.prompts import NOTES_COPILOT
from models.chat import ChatMessage, NotesCopilotContextItem
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "chat_messages"
_MAX_ITERATIONS = 6        # agentic loop cap
_NOTE_CONTENT_LIMIT = 3000 # chars per note in context


# ── Tool definitions ──────────────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "suggest_note_edit",
            "description": (
                "Suggest an edit to an existing note. "
                "The user will see a diff and can accept or reject. "
                "Provide the COMPLETE new HTML content for the note."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "Exact id of the note to edit (e.g. 'note_a1b2c3d4')",
                    },
                    "note_name": {
                        "type": "string",
                        "description": "Display name of the note",
                    },
                    "content": {
                        "type": "string",
                        "description": "The complete new HTML content for the note",
                    },
                    "description": {
                        "type": "string",
                        "description": "Brief description of what this edit does (1-2 sentences)",
                    },
                },
                "required": ["note_id", "note_name", "content", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_note_create",
            "description": (
                "Suggest creating a new note file. "
                "Specify where it should live using target_type / target_id. "
                "The user will see the proposed content and can accept or reject."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "note_name": {
                        "type": "string",
                        "description": "Name for the new note file",
                    },
                    "parent_id": {
                        "type": ["string", "null"],
                        "description": "Parent folder note ID, or null for root level",
                    },
                    "content": {
                        "type": "string",
                        "description": "The HTML content for the new note",
                    },
                    "description": {
                        "type": "string",
                        "description": "Brief description of the note purpose (1-2 sentences)",
                    },
                    "target_type": {
                        "type": "string",
                        "enum": ["library", "paper", "website", "github_repo"],
                        "description": (
                            "Where the note belongs: "
                            "'library' = top-level library notes, "
                            "'paper' / 'website' / 'github_repo' = under a specific item"
                        ),
                    },
                    "target_id": {
                        "type": ["string", "null"],
                        "description": (
                            "ID of the target paper / website / github_repo. "
                            "Must be null when target_type is 'library'."
                        ),
                    },
                },
                "required": ["note_name", "content", "description", "target_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_note",
            "description": (
                "Read the full HTML content of a note by its ID. "
                "Use this before suggesting an edit so you know the current content."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "ID of the note to read (e.g. 'note_a1b2c3d4')",
                    },
                },
                "required": ["note_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_item_notes",
            "description": (
                "List the notes tree for a specific item or the library root. "
                "Use this to discover what notes already exist before creating or editing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_type": {
                        "type": "string",
                        "enum": ["paper", "website", "github_repo", "library"],
                        "description": "Type of the item to list notes for",
                    },
                    "item_id": {
                        "type": "string",
                        "description": "ID of the item (library_id when item_type is 'library')",
                    },
                },
                "required": ["item_type", "item_id"],
            },
        },
    },
]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    """Very lightweight HTML → plain text for readability in tool results."""
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _format_notes_tree(notes: list[dict]) -> str:
    """Render a flat notes list as an indented tree string."""
    by_parent: dict[Optional[str], list[dict]] = {}
    for n in notes:
        key = n.get("parent_id") or n.get("parentId")
        by_parent.setdefault(key, []).append(n)

    lines: list[str] = []

    def _walk(parent_id: Optional[str], depth: int) -> None:
        for node in by_parent.get(parent_id, []):
            prefix = "  " * depth
            kind = "[folder]" if node.get("type") == "folder" else "[file]"
            lines.append(f"{prefix}{kind} id={node['id']}  name={node['name']}")

    _walk(None, 0)
    return "\n".join(lines) if lines else "(no notes)"


def _build_context_block(context_items: list[NotesCopilotContextItem]) -> str:
    """Assemble the context string injected as a system message."""
    if not context_items:
        return "No context items selected. Answer from general knowledge."

    parts: list[str] = []
    for item in context_items:
        header = f"=== {item.type.upper()}: {item.name} (id={item.id}) ==="
        meta_lines: list[str] = []
        if item.metadata:
            m = item.metadata
            # Paper
            if item.type == "paper":
                if m.get("title"):
                    meta_lines.append(f"Title: {m['title']}")
                if m.get("authors"):
                    authors = m["authors"]
                    meta_lines.append(f"Authors: {', '.join(authors[:5])}")
                if m.get("year"):
                    meta_lines.append(f"Year: {m['year']}")
                if m.get("venue"):
                    meta_lines.append(f"Venue: {m['venue']}")
                if m.get("abstract"):
                    meta_lines.append(f"Abstract: {m['abstract'][:800]}")
            # Website
            elif item.type == "website":
                if m.get("url"):
                    meta_lines.append(f"URL: {m['url']}")
                if m.get("description"):
                    meta_lines.append(f"Description: {m['description'][:500]}")
            # GitHub repo
            elif item.type == "github_repo":
                if m.get("url"):
                    meta_lines.append(f"URL: {m['url']}")
                if m.get("language"):
                    meta_lines.append(f"Language: {m['language']}")
                if m.get("stars") is not None:
                    meta_lines.append(f"Stars: {m['stars']}")
                if m.get("description"):
                    meta_lines.append(f"Description: {m['description'][:500]}")
                if m.get("abstract"):
                    meta_lines.append(f"Abstract: {m['abstract'][:600]}")
            # Library
            elif item.type == "library":
                if m.get("name"):
                    meta_lines.append(f"Library: {m['name']}")

        # Inject full PDF text when the user toggled "pdf?" on a paper chip
        if item.type == "paper" and item.include_pdf:
            pdf_url = None
            if item.metadata:
                pdf_url = item.metadata.get("pdfUrl") or item.metadata.get("pdf_url")
            if pdf_url:
                try:
                    from services import pdf_text_service
                    pdf_data = pdf_text_service.extract_and_cache(item.id, pdf_url)
                    if pdf_data and pdf_data.get("markdown"):
                        pages = pdf_data.get("page_count", "?")
                        meta_lines.append(
                            f"\n--- FULL PAPER TEXT ({pages} pages) ---\n{pdf_data['markdown']}"
                        )
                    else:
                        meta_lines.append("\n(PDF is available but no text could be extracted)")
                except Exception as e:
                    logger.warning("Failed to extract PDF for paper %s: %s", item.id, e)
                    meta_lines.append("\n(PDF extraction failed)")
            else:
                meta_lines.append("\n(No PDF available for this paper)")

        notes_lines: list[str] = []
        if item.notes:
            notes_lines.append("Notes:")
            for note in item.notes:
                if note.type == "folder":
                    notes_lines.append(f"  [folder] id={note.id} name={note.name}")
                else:
                    plain = _strip_html(note.content or "")[:_NOTE_CONTENT_LIMIT]
                    notes_lines.append(f"  [file] id={note.id} name={note.name}")
                    if note.parent_id:
                        notes_lines[-1] += f" parent={note.parent_id}"
                    if plain:
                        notes_lines.append(f"    content: {plain}")

        section = "\n".join(
            [header]
            + (meta_lines if meta_lines else ["(no metadata provided)"])
            + (notes_lines if notes_lines else ["Notes: (none)"])
        )
        parts.append(section)

    return "\n\n".join(parts)


def _process_tool_call(tc) -> tuple[Optional[dict], str]:
    """
    Handle one tool call from the LLM.

    Returns (suggestion_or_None, tool_result_text).
    suggestion is a dict when it's an output tool (edit / create).
    """
    try:
        args = json.loads(tc.function.arguments)
    except json.JSONDecodeError:
        logger.warning("Failed to parse tool args: %s", tc.function.arguments)
        return None, "Error: could not parse arguments."

    name = tc.function.name

    # ── Output tools (produce user-facing suggestions) ────────────────────────
    if name == "suggest_note_edit":
        suggestion = {
            "id": f"sug_{uuid.uuid4().hex[:8]}",
            "status": "pending",
            "type": "edit",
            "noteId": args.get("note_id", ""),
            "noteName": args.get("note_name", ""),
            "content": args.get("content", ""),
            "description": args.get("description", ""),
        }
        return suggestion, f"Edit suggestion created for '{suggestion['noteName']}'."

    if name == "suggest_note_create":
        suggestion = {
            "id": f"sug_{uuid.uuid4().hex[:8]}",
            "status": "pending",
            "type": "create",
            "noteName": args.get("note_name", ""),
            "parentId": args.get("parent_id"),
            "content": args.get("content", ""),
            "description": args.get("description", ""),
            "targetType": args.get("target_type", "library"),
            "targetId": args.get("target_id"),
        }
        return suggestion, f"Create suggestion queued for '{suggestion['noteName']}'."

    # ── Internal tools (return data, loop continues) ──────────────────────────
    if name == "read_note":
        note_id = args.get("note_id", "")
        try:
            from services import note_service
            note = note_service.get_note(note_id)
            if note is None:
                return None, f"Note '{note_id}' not found."
            plain = _strip_html(note.content)[:_NOTE_CONTENT_LIMIT]
            return None, f"Note id={note.id} name={note.name}:\n{plain}"
        except Exception as e:
            logger.warning("read_note failed: %s", e)
            return None, f"Could not read note: {e}"

    if name == "list_item_notes":
        item_type = args.get("item_type", "")
        item_id = args.get("item_id", "")
        try:
            from services import note_service
            kwargs: dict = {}
            if item_type == "paper":
                kwargs["paper_id"] = item_id
            elif item_type == "website":
                kwargs["website_id"] = item_id
            elif item_type == "github_repo":
                kwargs["github_repo_id"] = item_id
            elif item_type == "library":
                kwargs["library_id"] = item_id
            notes_raw = note_service.list_notes(**kwargs)
            tree = _format_notes_tree([n.model_dump() for n in notes_raw])
            return None, f"Notes for {item_type} {item_id}:\n{tree}"
        except Exception as e:
            logger.warning("list_item_notes failed: %s", e)
            return None, f"Could not list notes: {e}"

    return None, f"Unknown tool: {name}"


def _is_internal_tool(name: str) -> bool:
    return name in ("read_note", "list_item_notes")


# ── Persistence helpers ───────────────────────────────────────────────────────

def _try_list_messages(library_id: str) -> list[ChatMessage]:
    try:
        result = (
            get_client()
            .table(_TABLE)
            .select("*")
            .eq("library_id", library_id)
            .order("created_at")
            .execute()
        )
        return [ChatMessage.model_validate(r) for r in result.data]
    except Exception:
        logger.warning("Could not load notes-copilot history (library_id column may be missing)")
        return []


def _try_save_message(library_id: str, msg: ChatMessage) -> None:
    row = {
        "id": msg.id,
        "library_id": library_id,
        "role": msg.role,
        "content": msg.content,
        "created_at": msg.created_at,
    }
    if msg.suggestions is not None:
        row["suggestions"] = json.dumps(msg.suggestions)
    try:
        get_client().table(_TABLE).insert(row).execute()
    except Exception:
        logger.warning("Could not persist notes-copilot message (library_id column may be missing)")


def _make_message(library_id: str, role: str, content: str,
                  suggestions: Optional[list[dict]] = None) -> ChatMessage:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    return ChatMessage(
        id=f"msg_{uuid.uuid4().hex[:10]}",
        library_id=library_id,
        role=role,
        content=content,
        suggestions=suggestions,
        created_at=now,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def list_messages(library_id: str) -> list[ChatMessage]:
    return _try_list_messages(library_id)


def clear_history(library_id: str) -> int:
    try:
        result = (
            get_client()
            .table(_TABLE)
            .select("id", count="exact")
            .eq("library_id", library_id)
            .execute()
        )
        count = result.count or 0
        if count > 0:
            get_client().table(_TABLE).delete().eq("library_id", library_id).execute()
        logger.info("Cleared %d notes-copilot messages for library %s", count, library_id)
        return count
    except Exception:
        logger.warning("Could not clear notes-copilot history")
        return 0


def generate_response(
    library_id: str,
    user_content: str,
    context_items: list[NotesCopilotContextItem],
    history: list[dict],
) -> ChatMessage:
    """
    Run the agentic copilot loop and return the final assistant ChatMessage.

    history: [{role, content}, ...] — last N turns from the frontend.
    context_items: items the user @-mentioned with optional notes attached.
    """
    # Persist user message
    user_msg = _make_message(library_id, "user", user_content)
    _try_save_message(library_id, user_msg)

    # Build initial message list
    context_block = _build_context_block(context_items)
    messages: list[dict] = [
        {"role": "system", "content": NOTES_COPILOT},
        {"role": "system", "content": f"Library context:\n{context_block}"},
    ]
    # Inject conversation history (skip the last user message — it's already in user_content)
    for h in history[-20:]:
        role = h.get("role", "user")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    # Current user message
    messages.append({"role": "user", "content": user_content})

    all_suggestions: list[dict] = []
    final_content = ""
    client = get_openai_client()
    model_id = get_model("chat")

    try:
        for iteration in range(_MAX_ITERATIONS):
            response = client.chat.completions.create(
                model=model_id,
                messages=messages,
                tools=TOOLS,
                **completion_params(model_id, max_tokens=4096, temperature=0.7),
            )
            choice = response.choices[0]
            msg_content = choice.message.content or ""

            if msg_content:
                final_content = msg_content

            # No tool calls → we're done
            if not choice.message.tool_calls or choice.finish_reason == "stop":
                break

            # Build the assistant turn with tool_calls
            assistant_turn: dict = {"role": "assistant", "content": msg_content or None}
            assistant_turn["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in choice.message.tool_calls
            ]
            messages.append(assistant_turn)

            has_internal = False
            for tc in choice.message.tool_calls:
                suggestion, result_text = _process_tool_call(tc)
                if suggestion:
                    all_suggestions.append(suggestion)
                if _is_internal_tool(tc.function.name):
                    has_internal = True
                # Feed result back to model
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_text})

            # If only output tool calls (no internal reads), do one more pass to
            # get the textual summary, then stop.
            if not has_internal and iteration < _MAX_ITERATIONS - 1:
                # Will run one more iteration to get a text answer
                continue

    except Exception as e:
        logger.exception("Notes copilot LLM call failed for library %s", library_id)
        final_content = f"<p><em>Error generating response: {e}</em></p>"

    # Fallback summary when the model only used output tools
    if not final_content:
        if all_suggestions:
            n = len(all_suggestions)
            creates = sum(1 for s in all_suggestions if s["type"] == "create")
            edits = sum(1 for s in all_suggestions if s["type"] == "edit")
            parts = []
            if edits:
                parts.append(f"{edits} edit{'s' if edits > 1 else ''}")
            if creates:
                parts.append(f"{creates} new note{'s' if creates > 1 else ''}")
            final_content = (
                f"<p>Here {'are' if n > 1 else 'is'} my suggestion{'s' if n > 1 else ''}: "
                f"{' and '.join(parts)}. Review each one below.</p>"
            )
        else:
            final_content = "<p><em>No response generated.</em></p>"

    assistant_msg = _make_message(
        library_id,
        "assistant",
        final_content,
        suggestions=all_suggestions if all_suggestions else None,
    )
    _try_save_message(library_id, assistant_msg)
    return assistant_msg
