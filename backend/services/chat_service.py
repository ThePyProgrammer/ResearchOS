import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from agents.llm import get_model, get_openai_client, completion_params
from agents.prompts import PAPER_CHAT, WEBSITE_CHAT, GITHUB_REPO_CHAT

from models.chat import ChatMessage
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "chat_messages"

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "suggest_note_edit",
            "description": "Suggest an edit to an existing note. The user will see a diff and can accept or reject. Provide the COMPLETE new content for the note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "ID of the note to edit",
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
            "description": "Suggest creating a new note file. The user will see the proposed content and can accept or reject.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_name": {
                        "type": "string",
                        "description": "Name for the new note file",
                    },
                    "parent_id": {
                        "type": ["string", "null"],
                        "description": "Parent folder ID, or null for root level",
                    },
                    "content": {
                        "type": "string",
                        "description": "The HTML content for the new note",
                    },
                    "description": {
                        "type": "string",
                        "description": "Brief description of the note purpose (1-2 sentences)",
                    },
                },
                "required": ["note_name", "content", "description"],
            },
        },
    },
]


def _get_openai():
    return get_openai_client()


def _process_tool_calls(choice) -> tuple[str, list[dict]]:
    """Parse tool calls from an OpenAI response choice into suggestion dicts."""
    assistant_content = choice.message.content or ""
    suggestions = []

    if choice.message.tool_calls:
        for tc in choice.message.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                logger.warning("Failed to parse tool call args: %s", tc.function.arguments)
                continue

            suggestion: dict = {
                "id": f"sug_{uuid.uuid4().hex[:8]}",
                "status": "pending",
            }

            if tc.function.name == "suggest_note_edit":
                suggestion.update({
                    "type": "edit",
                    "noteId": args.get("note_id", ""),
                    "noteName": args.get("note_name", ""),
                    "content": args.get("content", ""),
                    "description": args.get("description", ""),
                })
            elif tc.function.name == "suggest_note_create":
                suggestion.update({
                    "type": "create",
                    "noteName": args.get("note_name", ""),
                    "parentId": args.get("parent_id"),
                    "content": args.get("content", ""),
                    "description": args.get("description", ""),
                })
            else:
                continue

            suggestions.append(suggestion)

        if not assistant_content and suggestions:
            n = len(suggestions)
            creates = sum(1 for s in suggestions if s["type"] == "create")
            edits = sum(1 for s in suggestions if s["type"] == "edit")
            parts = []
            if edits:
                parts.append(f"{edits} edit{'s' if edits > 1 else ''}")
            if creates:
                parts.append(f"{creates} new file{'s' if creates > 1 else ''}")
            assistant_content = (
                f"<p>Here {'are' if n > 1 else 'is'} my suggestion{'s' if n > 1 else ''}: "
                f"{' and '.join(parts)}. Review each one below.</p>"
            )

    return assistant_content, suggestions


# ─── Paper chat ───────────────────────────────────────────────────────────────

def list_messages(paper_id: str) -> list[ChatMessage]:
    result = (
        get_client()
        .table(_TABLE)
        .select("*")
        .eq("paper_id", paper_id)
        .order("created_at")
        .execute()
    )
    return [ChatMessage.model_validate(r) for r in result.data]


def create_message(
    paper_id: str,
    role: str,
    content: str,
    suggestions: Optional[list[dict]] = None,
) -> ChatMessage:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    msg = ChatMessage(
        id=f"msg_{uuid.uuid4().hex[:10]}",
        paper_id=paper_id,
        role=role,
        content=content,
        suggestions=suggestions,
        created_at=now,
    )
    row = msg.model_dump(by_alias=False)
    row.pop("website_id", None)
    if row.get("suggestions") is None:
        row.pop("suggestions", None)
    get_client().table(_TABLE).insert(row).execute()
    return msg


def clear_history(paper_id: str) -> int:
    result = (
        get_client()
        .table(_TABLE)
        .select("id", count="exact")
        .eq("paper_id", paper_id)
        .execute()
    )
    count = result.count or 0
    if count > 0:
        get_client().table(_TABLE).delete().eq("paper_id", paper_id).execute()
    logger.info("Cleared %d chat messages for paper %s", count, paper_id)
    return count


def generate_response(
    paper_id: str,
    user_content: str,
    paper_title: str = "",
    paper_abstract: str = "",
    pdf_url: Optional[str] = None,
    note_context: Optional[str] = None,
    notes_context: Optional[list[dict]] = None,
) -> ChatMessage:
    """Send user message to OpenAI with paper + notes context, using tool calling for suggestions."""
    create_message(paper_id, "user", user_content)

    history = list_messages(paper_id)
    messages = [{"role": "system", "content": PAPER_CHAT}]

    paper_ctx = f"Paper title: {paper_title}"
    if paper_abstract:
        paper_ctx += f"\n\nAbstract: {paper_abstract}"

    if pdf_url:
        try:
            from services.pdf_text_service import extract_and_cache
            cached = extract_and_cache(paper_id, pdf_url)
            if cached and cached.get("markdown"):
                paper_ctx += (
                    f"\n\n--- FULL PAPER TEXT ({cached.get('page_count', '?')} pages) ---\n"
                    f"{cached['markdown']}"
                )
        except Exception:
            logger.warning("Could not extract PDF text for paper %s, using abstract only", paper_id)

    if note_context:
        paper_ctx += f"\n\nCurrently selected note content:\n{note_context}"

    messages.append({"role": "system", "content": f"Paper context:\n{paper_ctx}"})

    if notes_context:
        notes_desc = "User's notes filesystem:\n"
        for n in notes_context:
            prefix = "[folder]" if n.get("type") == "folder" else "[file]"
            notes_desc += f"  {prefix} id={n['id']} name={n['name']}"
            if n.get("parentId"):
                notes_desc += f" parent={n['parentId']}"
            if n.get("content") and n.get("type") != "folder":
                c = n["content"][:2000]
                notes_desc += f"\n    content: {c}"
            notes_desc += "\n"
        messages.append({"role": "system", "content": notes_desc})

    for msg in history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        client = _get_openai()
        model_id = get_model("chat")
        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            tools=TOOLS,
            **completion_params(model_id, max_tokens=4096, temperature=0.7),
        )
        assistant_content, suggestions = _process_tool_calls(response.choices[0])
    except Exception as e:
        logger.exception("OpenAI API call failed for paper %s", paper_id)
        assistant_content = f"<p><em>Error generating response: {e}</em></p>"
        suggestions = []

    return create_message(
        paper_id,
        "assistant",
        assistant_content,
        suggestions=suggestions if suggestions else None,
    )


# ─── Website chat ─────────────────────────────────────────────────────────────

def list_messages_for_website(website_id: str) -> list[ChatMessage]:
    result = (
        get_client()
        .table(_TABLE)
        .select("*")
        .eq("website_id", website_id)
        .order("created_at")
        .execute()
    )
    return [ChatMessage.model_validate(r) for r in result.data]


def create_message_for_website(
    website_id: str,
    role: str,
    content: str,
    suggestions: Optional[list[dict]] = None,
) -> ChatMessage:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    msg = ChatMessage(
        id=f"msg_{uuid.uuid4().hex[:10]}",
        website_id=website_id,
        role=role,
        content=content,
        suggestions=suggestions,
        created_at=now,
    )
    row = msg.model_dump(by_alias=False)
    row.pop("paper_id", None)
    if row.get("suggestions") is None:
        row.pop("suggestions", None)
    get_client().table(_TABLE).insert(row).execute()
    return msg


def clear_history_for_website(website_id: str) -> int:
    result = (
        get_client()
        .table(_TABLE)
        .select("id", count="exact")
        .eq("website_id", website_id)
        .execute()
    )
    count = result.count or 0
    if count > 0:
        get_client().table(_TABLE).delete().eq("website_id", website_id).execute()
    logger.info("Cleared %d chat messages for website %s", count, website_id)
    return count


def generate_response_for_website(
    website_id: str,
    user_content: str,
    website_title: str = "",
    website_url: str = "",
    website_description: Optional[str] = None,
    website_authors: Optional[list[str]] = None,
    notes_context: Optional[list[dict]] = None,
) -> ChatMessage:
    """Send user message to OpenAI with website + notes context, using tool calling for suggestions."""
    create_message_for_website(website_id, "user", user_content)

    history = list_messages_for_website(website_id)
    messages = [{"role": "system", "content": WEBSITE_CHAT}]

    site_ctx = f"Website title: {website_title}\nURL: {website_url}"
    if website_authors:
        site_ctx += f"\nAuthors: {', '.join(website_authors)}"
    if website_description:
        site_ctx += f"\n\nDescription: {website_description}"

    messages.append({"role": "system", "content": f"Website context:\n{site_ctx}"})

    if notes_context:
        notes_desc = "User's notes filesystem:\n"
        for n in notes_context:
            prefix = "[folder]" if n.get("type") == "folder" else "[file]"
            notes_desc += f"  {prefix} id={n['id']} name={n['name']}"
            if n.get("parentId"):
                notes_desc += f" parent={n['parentId']}"
            if n.get("content") and n.get("type") != "folder":
                c = n["content"][:2000]
                notes_desc += f"\n    content: {c}"
            notes_desc += "\n"
        messages.append({"role": "system", "content": notes_desc})

    for msg in history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        client = _get_openai()
        model_id = get_model("chat")
        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            tools=TOOLS,
            **completion_params(model_id, max_tokens=4096, temperature=0.7),
        )
        assistant_content, suggestions = _process_tool_calls(response.choices[0])
    except Exception as e:
        logger.exception("OpenAI API call failed for website %s", website_id)
        assistant_content = f"<p><em>Error generating response: {e}</em></p>"
        suggestions = []

    return create_message_for_website(
        website_id,
        "assistant",
        assistant_content,
        suggestions=suggestions if suggestions else None,
    )


# ─── GitHub Repo chat ─────────────────────────────────────────────────────────

def list_messages_for_github_repo(github_repo_id: str) -> list[ChatMessage]:
    result = (
        get_client()
        .table(_TABLE)
        .select("*")
        .eq("github_repo_id", github_repo_id)
        .order("created_at")
        .execute()
    )
    return [ChatMessage.model_validate(r) for r in result.data]


def create_message_for_github_repo(
    github_repo_id: str,
    role: str,
    content: str,
    suggestions: Optional[list[dict]] = None,
) -> ChatMessage:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    msg = ChatMessage(
        id=f"msg_{uuid.uuid4().hex[:10]}",
        github_repo_id=github_repo_id,
        role=role,
        content=content,
        suggestions=suggestions,
        created_at=now,
    )
    row = msg.model_dump(by_alias=False)
    row.pop("paper_id", None)
    row.pop("website_id", None)
    if row.get("suggestions") is None:
        row.pop("suggestions", None)
    get_client().table(_TABLE).insert(row).execute()
    return msg


def clear_history_for_github_repo(github_repo_id: str) -> int:
    result = (
        get_client()
        .table(_TABLE)
        .select("id", count="exact")
        .eq("github_repo_id", github_repo_id)
        .execute()
    )
    count = result.count or 0
    if count > 0:
        get_client().table(_TABLE).delete().eq("github_repo_id", github_repo_id).execute()
    logger.info("Cleared %d chat messages for github_repo %s", count, github_repo_id)
    return count


def generate_response_for_github_repo(
    github_repo_id: str,
    user_content: str,
    repo_title: str = "",
    repo_url: str = "",
    repo_owner: str = "",
    repo_name: str = "",
    repo_description: Optional[str] = None,
    repo_abstract: Optional[str] = None,
    repo_language: Optional[str] = None,
    repo_topics: Optional[list[str]] = None,
    repo_stars: Optional[int] = None,
    notes_context: Optional[list[dict]] = None,
) -> ChatMessage:
    """Send user message to OpenAI with GitHub repo + notes context."""
    create_message_for_github_repo(github_repo_id, "user", user_content)

    history = list_messages_for_github_repo(github_repo_id)
    messages = [{"role": "system", "content": GITHUB_REPO_CHAT}]

    repo_ctx = f"Repository: {repo_owner}/{repo_name}\nTitle: {repo_title}\nURL: {repo_url}"
    if repo_language:
        repo_ctx += f"\nLanguage: {repo_language}"
    if repo_topics:
        repo_ctx += f"\nTopics: {', '.join(repo_topics)}"
    if repo_stars is not None:
        repo_ctx += f"\nStars: {repo_stars}"
    if repo_abstract:
        repo_ctx += f"\n\nAbstract: {repo_abstract}"
    elif repo_description:
        repo_ctx += f"\n\nDescription: {repo_description}"

    messages.append({"role": "system", "content": f"Repository context:\n{repo_ctx}"})

    if notes_context:
        notes_desc = "User's notes filesystem:\n"
        for n in notes_context:
            prefix = "[folder]" if n.get("type") == "folder" else "[file]"
            notes_desc += f"  {prefix} id={n['id']} name={n['name']}"
            if n.get("parentId"):
                notes_desc += f" parent={n['parentId']}"
            if n.get("content") and n.get("type") != "folder":
                c = n["content"][:2000]
                notes_desc += f"\n    content: {c}"
            notes_desc += "\n"
        messages.append({"role": "system", "content": notes_desc})

    for msg in history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        client = _get_openai()
        model_id = get_model("chat")
        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            tools=TOOLS,
            **completion_params(model_id, max_tokens=4096, temperature=0.7),
        )
        assistant_content, suggestions = _process_tool_calls(response.choices[0])
    except Exception as e:
        logger.exception("OpenAI API call failed for github_repo %s", github_repo_id)
        assistant_content = f"<p><em>Error generating response: {e}</em></p>"
        suggestions = []

    return create_message_for_github_repo(
        github_repo_id,
        "assistant",
        assistant_content,
        suggestions=suggestions if suggestions else None,
    )
