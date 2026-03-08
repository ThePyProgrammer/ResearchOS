import json
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
_AUTO_FOLDER_NAME = "AI Notes"

_BASE_SYSTEM_PROMPT = """\
You are a research note-taker embedded in a paper and article management system.
Your job is to produce a well-organized set of notes as separate files, optionally grouped into folders.

IMPORTANT: Create MULTIPLE separate note files — do NOT put everything into one file.
Each file should cover a single focused topic or aspect of the item.
Use folders to group related notes when there are enough files to warrant organization.

Good structures look like:
- "Summary" (file) — high-level 2-3 paragraph overview
- "Key Contributions" (file) — main contributions and novelty
- "Methodology" (folder)
  - "Approach" (file) — detailed methodology description
  - "Experimental Setup" (file) — datasets, baselines, metrics
- "Results & Analysis" (file) — key findings and takeaways
- "Limitations & Future Work" (file)
- "Key Equations" (file) — important formulas explained
- "Related Work" (file) — context in the broader field

Adapt the structure to the content — a math-heavy paper needs a "Key Equations" file,
a systems paper needs an "Architecture" file, a survey needs a "Taxonomy" file, etc.
Aim for 3-8 files total. Use folders only when grouping 2+ related files.

Respond with a JSON object (no markdown fencing) with this schema:
{
  "notes": [
    {
      "name": "file or folder name",
      "type": "file" or "folder",
      "content": "HTML content (only for files, omit for folders)",
      "children": [ ...nested notes... ]  // only for folders, omit for files
    }
  ]
}

For file content, output valid HTML suitable for a tiptap rich-text editor.
Use these tags: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <li>, <ol>, <code>, <blockquote>.
For math use LaTeX: $...$ inline, $$...$$ display.
Do NOT include <html>, <body>, or <head> tags.
Each file's content should be focused and self-contained — NOT a giant dump of everything."""


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


def _call_openai_json(system: str, user_msg: str) -> dict:
    """Call OpenAI and parse a JSON response with the multi-note structure."""
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
        response_format={"type": "json_object"},
        max_tokens=4096,
        temperature=0.4,
    )
    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse AI notes JSON, wrapping as single note")
        return {"notes": [{"name": "AI Overview", "type": "file", "content": raw}]}


def _delete_auto_folder(paper_id: Optional[str], website_id: Optional[str]) -> None:
    """Delete the existing 'AI Notes' folder (and all children) for this item."""
    query = get_client().table(_TABLE).select("id").eq("name", _AUTO_FOLDER_NAME).eq("type", "folder")
    if paper_id:
        query = query.eq("paper_id", paper_id)
    elif website_id:
        query = query.eq("website_id", website_id)
    for row in query.execute().data:
        delete_note(row["id"])

    # Also clean up legacy single "AI Overview" notes
    query2 = get_client().table(_TABLE).select("id").eq("name", "AI Overview")
    if paper_id:
        query2 = query2.eq("paper_id", paper_id)
    elif website_id:
        query2 = query2.eq("website_id", website_id)
    for row in query2.execute().data:
        delete_note(row["id"])


def _create_notes_from_tree(
    notes_tree: list[dict],
    paper_id: Optional[str],
    website_id: Optional[str],
    parent_id: Optional[str] = None,
) -> list[Note]:
    """Recursively create notes/folders from the LLM's JSON tree structure."""
    created: list[Note] = []
    for item in notes_tree:
        name = item.get("name", "Untitled")
        note_type = item.get("type", "file")
        content = item.get("content", "") if note_type == "file" else ""

        note = create_note(
            NoteCreate(name=name, type=note_type, content=content, parent_id=parent_id),
            paper_id=paper_id,
            website_id=website_id,
        )
        created.append(note)

        # Recurse into children for folders
        if note_type == "folder" and item.get("children"):
            children = _create_notes_from_tree(
                item["children"], paper_id, website_id, parent_id=note.id,
            )
            created.extend(children)

    return created


def _generate_multi_notes(
    paper_id: Optional[str],
    website_id: Optional[str],
    library_id: Optional[str],
    user_msg: str,
) -> list[Note]:
    """Core generation: call LLM, parse JSON tree, create folder structure."""
    custom_prompt = _get_custom_prompt(library_id)
    system = _BASE_SYSTEM_PROMPT
    if custom_prompt:
        system += f"\n\nAdditional instructions from the researcher:\n{custom_prompt}"

    result = _call_openai_json(system, user_msg)
    notes_tree = result.get("notes", [])

    if not notes_tree:
        # Fallback: create a single summary note
        notes_tree = [{"name": "Summary", "type": "file", "content": "<p>No content generated.</p>"}]

    # Delete previous auto-generated notes
    _delete_auto_folder(paper_id, website_id)

    # Create the "AI Notes" root folder
    root_folder = create_note(
        NoteCreate(name=_AUTO_FOLDER_NAME, type="folder"),
        paper_id=paper_id,
        website_id=website_id,
    )

    # Create all notes inside the folder
    created = _create_notes_from_tree(notes_tree, paper_id, website_id, parent_id=root_folder.id)

    logger.info(
        "Generated %d AI notes in folder %s (paper=%s website=%s)",
        len(created), root_folder.id, paper_id, website_id,
    )
    return [root_folder] + created


def generate_notes(paper_id: str, library_id: Optional[str] = None) -> list[Note]:
    """Generate AI notes for a paper as a multi-file structure."""
    paper_row = get_client().table("papers").select("*").eq("id", paper_id).execute()
    if not paper_row.data:
        raise ValueError(f"Paper {paper_id} not found")
    paper = paper_row.data[0]

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

    return _generate_multi_notes(paper_id=paper_id, website_id=None, library_id=library_id, user_msg=user_msg)


def generate_notes_for_website(website_id: str, library_id: Optional[str] = None) -> list[Note]:
    """Generate AI notes for a website as a multi-file structure."""
    site_row = get_client().table("websites").select("*").eq("id", website_id).execute()
    if not site_row.data:
        raise ValueError(f"Website {website_id} not found")
    site = site_row.data[0]

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

    return _generate_multi_notes(paper_id=None, website_id=website_id, library_id=library_id, user_msg=user_msg)
