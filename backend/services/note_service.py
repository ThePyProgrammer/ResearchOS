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


def list_notes(paper_id: str) -> list[Note]:
    result = get_client().table(_TABLE).select("*").eq("paper_id", paper_id).execute()
    return [Note.model_validate(r) for r in result.data]


def get_note(note_id: str) -> Optional[Note]:
    result = get_client().table(_TABLE).select("*").eq("id", note_id).execute()
    if not result.data:
        return None
    return Note.model_validate(result.data[0])


def create_note(paper_id: str, data: NoteCreate) -> Note:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    note = Note(
        id=f"note_{uuid.uuid4().hex[:8]}",
        paper_id=paper_id,
        name=data.name,
        parent_id=data.parent_id,
        type=data.type,
        content=data.content,
        created_at=now,
        updated_at=now,
    )
    get_client().table(_TABLE).insert(note.model_dump(by_alias=False)).execute()
    logger.info("Created note '%s' for paper %s", data.name, paper_id)
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


_AUTO_NOTE_NAME = "AI Overview"

_BASE_SYSTEM_PROMPT = """\
You are a research note-taker embedded in a paper management system.
Given a research paper's metadata and abstract, write comprehensive, well-structured notes.

Output ONLY valid HTML suitable for a rich-text editor (tiptap).
Use these tags: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <li>, <ol>, <code>, <blockquote>.
For mathematical expressions use LaTeX with dollar delimiters: $...$ inline, $$...$$ display.
Do NOT include <html>, <body>, or <head> tags — output the inner HTML content only.
Do NOT include any preamble or explanation — output the HTML note directly.\
"""


def generate_notes(paper_id: str, library_id: Optional[str] = None) -> Note:
    """Use OpenAI to generate an AI overview note for a paper and save it to the notes filesystem."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    # Fetch paper
    paper_row = get_client().table("papers").select("*").eq("id", paper_id).execute()
    if not paper_row.data:
        raise ValueError(f"Paper {paper_id} not found")
    paper = paper_row.data[0]

    # Fetch library settings for custom prompt
    custom_prompt: Optional[str] = None
    if library_id:
        lib_row = get_client().table("libraries").select("auto_note_prompt").eq("id", library_id).execute()
        if lib_row.data:
            custom_prompt = lib_row.data[0].get("auto_note_prompt") or None

    system = _BASE_SYSTEM_PROMPT
    if custom_prompt:
        system += f"\n\nAdditional instructions from the researcher:\n{custom_prompt}"

    authors = paper.get("authors") or []
    if isinstance(authors, list):
        authors_str = ", ".join(authors[:5]) + (" et al." if len(authors) > 5 else "")
    else:
        authors_str = str(authors)

    user_msg = (
        f"Title: {paper.get('title', 'Unknown')}\n"
        f"Authors: {authors_str}\n"
        f"Year: {paper.get('year', '')}\n"
        f"Venue: {paper.get('venue', '')}\n"
    )
    if paper.get("abstract"):
        user_msg += f"\nAbstract:\n{paper['abstract']}"

    # Try to include full PDF text if available
    try:
        from services.pdf_text_service import get_cached_text
        cached = get_cached_text(paper_id)
        if cached and cached.get("markdown"):
            user_msg += f"\n\nFull paper text ({cached.get('page_count', '?')} pages):\n{cached['markdown'][:12000]}"
    except Exception:
        pass

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
    html_content = response.choices[0].message.content or "<p>No content generated.</p>"

    # Delete any existing AI Overview note for this paper so we replace it cleanly
    existing = get_client().table(_TABLE).select("id").eq("paper_id", paper_id).eq("name", _AUTO_NOTE_NAME).execute()
    for row in existing.data:
        delete_note(row["id"])

    note = create_note(paper_id, NoteCreate(name=_AUTO_NOTE_NAME, content=html_content))
    logger.info("Generated AI notes for paper %s (note %s)", paper_id, note.id)
    return note


def delete_note(note_id: str) -> bool:
    existing = get_note(note_id)
    if existing is None:
        return False
    # Recursively delete children if this is a folder
    if existing.type == "folder":
        children = get_client().table(_TABLE).select("id").eq("parent_id", note_id).execute()
        for child in children.data:
            delete_note(child["id"])
    get_client().table(_TABLE).delete().eq("id", note_id).execute()
    logger.info("Deleted note %s", note_id)
    return True
