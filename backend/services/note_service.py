import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

from models.note import Note, NoteCreate, NoteUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "notes"
_AUTO_NOTE_NAME = "AI Overview"

_BASE_SYSTEM_PROMPT = """\
You are a research note-taker embedded in a paper and article management system.
Write comprehensive, well-structured notes about the given item.

Output ONLY valid HTML suitable for a rich-text editor (tiptap).
Use these tags: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <li>, <ol>, <code>, <blockquote>.
For mathematical expressions use LaTeX with dollar delimiters: $...$ inline, $$...$$ display.
Do NOT include <html>, <body>, or <head> tags — output the inner HTML content only.
Do NOT include any preamble or explanation — output the HTML note directly."""


# ---------------------------------------------------------------------------
# Core CRUD
# ---------------------------------------------------------------------------

def list_notes(paper_id: Optional[str] = None, website_id: Optional[str] = None) -> list[Note]:
    query = get_client().table(_TABLE).select("*")
    if paper_id:
        query = query.eq("paper_id", paper_id)
    elif website_id:
        query = query.eq("website_id", website_id)
    result = query.execute()
    return [Note.model_validate(r) for r in result.data]


def get_note(note_id: str) -> Optional[Note]:
    result = get_client().table(_TABLE).select("*").eq("id", note_id).execute()
    if not result.data:
        return None
    return Note.model_validate(result.data[0])


def create_note(
    data: NoteCreate,
    paper_id: Optional[str] = None,
    website_id: Optional[str] = None,
) -> Note:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    note = Note(
        id=f"note_{uuid.uuid4().hex[:8]}",
        paper_id=paper_id,
        website_id=website_id,
        name=data.name,
        parent_id=data.parent_id,
        type=data.type,
        content=data.content,
        created_at=now,
        updated_at=now,
    )
    row = {k: v for k, v in note.model_dump(by_alias=False).items() if v is not None}
    get_client().table(_TABLE).insert(row).execute()
    logger.info("Created note '%s' (paper=%s website=%s)", data.name, paper_id, website_id)
    return note


def update_note(note_id: str, data: NoteUpdate) -> Optional[Note]:
    existing = get_note(note_id)
    if existing is None:
        return None
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return existing
    updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    get_client().table(_TABLE).update(updates).eq("id", note_id).execute()
    return get_note(note_id)


def delete_note(note_id: str) -> bool:
    existing = get_note(note_id)
    if existing is None:
        return False
    if existing.type == "folder":
        children = get_client().table(_TABLE).select("id").eq("parent_id", note_id).execute()
        for child in children.data:
            delete_note(child["id"])
    get_client().table(_TABLE).delete().eq("id", note_id).execute()
    logger.info("Deleted note %s", note_id)
    return True


# ---------------------------------------------------------------------------
# AI generation helpers
# ---------------------------------------------------------------------------

def _get_custom_prompt(library_id: Optional[str]) -> Optional[str]:
    if not library_id:
        return None
    row = get_client().table("libraries").select("auto_note_prompt").eq("id", library_id).execute()
    if row.data:
        return row.data[0].get("auto_note_prompt") or None
    return None


def _call_openai(system: str, user_msg: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=2048,
        temperature=0.4,
    )
    return response.choices[0].message.content or "<p>No content generated.</p>"


def _replace_auto_note(html_content: str, paper_id: Optional[str], website_id: Optional[str]) -> Note:
    """Delete any existing AI Overview for this item and create a fresh one."""
    query = get_client().table(_TABLE).select("id").eq("name", _AUTO_NOTE_NAME)
    if paper_id:
        query = query.eq("paper_id", paper_id)
    elif website_id:
        query = query.eq("website_id", website_id)
    for row in query.execute().data:
        delete_note(row["id"])
    return create_note(
        NoteCreate(name=_AUTO_NOTE_NAME, content=html_content),
        paper_id=paper_id,
        website_id=website_id,
    )


def generate_notes(paper_id: str, library_id: Optional[str] = None) -> Note:
    """Generate an AI overview note for a paper."""
    paper_row = get_client().table("papers").select("*").eq("id", paper_id).execute()
    if not paper_row.data:
        raise ValueError(f"Paper {paper_id} not found")
    paper = paper_row.data[0]

    custom_prompt = _get_custom_prompt(library_id)
    system = _BASE_SYSTEM_PROMPT
    if custom_prompt:
        system += f"\n\nAdditional instructions from the researcher:\n{custom_prompt}"

    authors = paper.get("authors") or []
    authors_str = (
        ", ".join(authors[:5]) + (" et al." if len(authors) > 5 else "")
        if isinstance(authors, list) else str(authors)
    )
    user_msg = (
        f"Title: {paper.get('title', 'Unknown')}\n"
        f"Authors: {authors_str}\n"
        f"Year: {paper.get('year', '')}\n"
        f"Venue: {paper.get('venue', '')}\n"
    )
    if paper.get("abstract"):
        user_msg += f"\nAbstract:\n{paper['abstract']}"

    try:
        from services.pdf_text_service import get_cached_text
        cached = get_cached_text(paper_id)
        if cached and cached.get("markdown"):
            user_msg += (
                f"\n\nFull paper text ({cached.get('page_count', '?')} pages):\n"
                f"{cached['markdown'][:12000]}"
            )
    except Exception:
        pass

    html_content = _call_openai(system, user_msg)
    note = _replace_auto_note(html_content, paper_id=paper_id, website_id=None)
    logger.info("Generated AI notes for paper %s (note %s)", paper_id, note.id)
    return note


def generate_notes_for_website(website_id: str, library_id: Optional[str] = None) -> Note:
    """Generate an AI overview note for a website."""
    site_row = get_client().table("websites").select("*").eq("id", website_id).execute()
    if not site_row.data:
        raise ValueError(f"Website {website_id} not found")
    site = site_row.data[0]

    custom_prompt = _get_custom_prompt(library_id)
    system = _BASE_SYSTEM_PROMPT
    if custom_prompt:
        system += f"\n\nAdditional instructions from the researcher:\n{custom_prompt}"

    authors = site.get("authors") or []
    authors_str = (
        ", ".join(authors[:5]) + (" et al." if len(authors) > 5 else "")
        if isinstance(authors, list) else str(authors)
    )
    user_msg = f"Title: {site.get('title', 'Unknown')}\n"
    if authors_str:
        user_msg += f"Author(s): {authors_str}\n"
    if site.get("published_date"):
        user_msg += f"Published: {site['published_date']}\n"
    user_msg += f"URL: {site.get('url', '')}\n"
    if site.get("description"):
        user_msg += f"\nDescription:\n{site['description']}"

    html_content = _call_openai(system, user_msg)
    note = _replace_auto_note(html_content, paper_id=None, website_id=website_id)
    logger.info("Generated AI notes for website %s (note %s)", website_id, note.id)
    return note
