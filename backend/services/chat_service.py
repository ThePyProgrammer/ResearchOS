import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

from models.chat import ChatMessage, ChatMessageCreate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "chat_messages"

SYSTEM_PROMPT = """You are a helpful research copilot embedded in a paper reading and note-taking IDE.
You have full access to the paper's extracted text content.
Help the user understand the paper, answer questions, summarize sections, suggest related work,
brainstorm ideas, and assist with writing notes.
Be concise, accurate, and cite specifics from the paper when relevant.
When referencing the paper, quote exact passages where possible.
Format your responses in clean HTML suitable for display (use <p>, <strong>, <em>, <ul>, <li>, <code>, <pre>, <h3> tags).
Do NOT use markdown formatting — use HTML tags directly.
For mathematical expressions, use LaTeX with dollar sign delimiters: $...$ for inline math and $$...$$ for display math.
The frontend renders LaTeX via KaTeX."""


def _get_openai() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


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


def create_message(paper_id: str, role: str, content: str) -> ChatMessage:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    msg = ChatMessage(
        id=f"msg_{uuid.uuid4().hex[:10]}",
        paper_id=paper_id,
        role=role,
        content=content,
        created_at=now,
    )
    get_client().table(_TABLE).insert(msg.model_dump(by_alias=False)).execute()
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
) -> ChatMessage:
    """Send user message to OpenAI with paper context and return assistant response."""
    # Save user message first
    user_msg = create_message(paper_id, "user", user_content)

    # Build conversation history
    history = list_messages(paper_id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add paper context
    paper_ctx = f"Paper title: {paper_title}"
    if paper_abstract:
        paper_ctx += f"\n\nAbstract: {paper_abstract}"

    # Add full PDF text if available
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
        paper_ctx += f"\n\nCurrent note content:\n{note_context}"
    messages.append({"role": "system", "content": f"Paper context:\n{paper_ctx}"})

    # Add chat history (limit to last 20 messages to control context)
    for msg in history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        client = _get_openai()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=2048,
            temperature=0.7,
        )
        assistant_content = response.choices[0].message.content or ""
    except Exception as e:
        logger.exception("OpenAI API call failed for paper %s", paper_id)
        assistant_content = f"<p><em>Error generating response: {e}</em></p>"

    # Save assistant message
    assistant_msg = create_message(paper_id, "assistant", assistant_content)
    return assistant_msg
