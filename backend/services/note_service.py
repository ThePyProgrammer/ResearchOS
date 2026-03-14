import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from agents.llm import get_model, get_openai_client, is_new_api_model, completion_params
from agents.prompts import NOTE_GENERATION
from services.cost_service import record_openai_usage

from models.note import Note, NoteCreate, NoteUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "notes"
_AUTO_FOLDER_NAME = "AI Notes"


# ---------------------------------------------------------------------------
# Core CRUD
# ---------------------------------------------------------------------------

def list_notes(
    paper_id: Optional[str] = None,
    website_id: Optional[str] = None,
    github_repo_id: Optional[str] = None,
    library_id: Optional[str] = None,
) -> list[Note]:
    query = get_client().table(_TABLE).select("*")
    if paper_id:
        query = query.eq("paper_id", paper_id)
    elif website_id:
        query = query.eq("website_id", website_id)
    elif github_repo_id:
        query = query.eq("github_repo_id", github_repo_id)
    elif library_id:
        query = query.eq("library_id", library_id)
    result = query.execute()
    notes = [Note.model_validate(r) for r in result.data]
    # Pinned notes float to the top; within each pin tier keep folders before
    # files, then sort alphabetically.
    notes.sort(key=lambda n: (not n.is_pinned, n.type != "folder", n.name.lower()))
    return notes


def get_note(note_id: str) -> Optional[Note]:
    result = get_client().table(_TABLE).select("*").eq("id", note_id).execute()
    if not result.data:
        return None
    return Note.model_validate(result.data[0])


def create_note(
    data: NoteCreate,
    paper_id: Optional[str] = None,
    website_id: Optional[str] = None,
    github_repo_id: Optional[str] = None,
    library_id: Optional[str] = None,
) -> Note:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    note = Note(
        id=f"note_{uuid.uuid4().hex[:8]}",
        paper_id=paper_id,
        website_id=website_id,
        github_repo_id=github_repo_id,
        library_id=library_id,
        name=data.name,
        parent_id=data.parent_id,
        type=data.type,
        content=data.content,
        created_at=now,
        updated_at=now,
    )
    row = {k: v for k, v in note.model_dump(by_alias=False).items() if v is not None}
    get_client().table(_TABLE).insert(row).execute()
    logger.info("Created note '%s' (paper=%s website=%s repo=%s library=%s)", data.name, paper_id, website_id, github_repo_id, library_id)
    return note


_SOURCE_FIELDS = {"paper_id", "website_id", "github_repo_id", "library_id"}


def update_note(note_id: str, data: NoteUpdate) -> Optional[Note]:
    existing = get_note(note_id)
    if existing is None:
        return None
    # exclude_unset (not exclude_none) so callers can explicitly set fields to null
    updates = data.model_dump(exclude_unset=True)
    # When reassigning to a different source, null out all other source fields so
    # a note always belongs to exactly one source at a time.
    if any(f in updates for f in _SOURCE_FIELDS):
        for f in _SOURCE_FIELDS:
            if f not in updates:
                updates[f] = None
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
    client = get_openai_client()
    model_id = get_model("notes")

    create_kwargs: dict = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        **completion_params(model_id, max_tokens=4096, temperature=0.4),
    }

    if is_new_api_model(model_id):
        # json_schema response format for newer models
        create_kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "notes_output",
                "strict": False,
                "schema": {
                    "type": "object",
                    "properties": {
                        "notes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "type": {"type": "string", "enum": ["file", "folder"]},
                                    "content": {"type": "string"},
                                    "children": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "name": {"type": "string"},
                                                "type": {"type": "string", "enum": ["file", "folder"]},
                                                "content": {"type": "string"},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "required": ["notes"],
                },
            },
        }
    else:
        create_kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**create_kwargs)
    record_openai_usage(response.usage, model_id)
    choice = response.choices[0]

    # Check for refusal (newer models may refuse via a .refusal field)
    refusal = getattr(choice.message, "refusal", None)
    if refusal:
        logger.warning("Model refused note generation: %s", refusal)
        return {"notes": [{"name": "Error", "type": "file", "content": f"<p>Model refused: {refusal}</p>"}]}

    raw = choice.message.content or "{}"
    logger.info("Note generation raw response (%d chars): %.200s...", len(raw), raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse AI notes JSON, wrapping as single note")
        return {"notes": [{"name": "AI Overview", "type": "file", "content": raw}]}


def _delete_auto_folder(
    paper_id: Optional[str],
    website_id: Optional[str],
    github_repo_id: Optional[str] = None,
) -> None:
    """Delete the existing 'AI Notes' folder (and all children) for this item."""
    query = get_client().table(_TABLE).select("id").eq("name", _AUTO_FOLDER_NAME).eq("type", "folder")
    if paper_id:
        query = query.eq("paper_id", paper_id)
    elif website_id:
        query = query.eq("website_id", website_id)
    elif github_repo_id:
        query = query.eq("github_repo_id", github_repo_id)
    for row in query.execute().data:
        delete_note(row["id"])

    # Also clean up legacy single "AI Overview" notes
    query2 = get_client().table(_TABLE).select("id").eq("name", "AI Overview")
    if paper_id:
        query2 = query2.eq("paper_id", paper_id)
    elif website_id:
        query2 = query2.eq("website_id", website_id)
    elif github_repo_id:
        query2 = query2.eq("github_repo_id", github_repo_id)
    for row in query2.execute().data:
        delete_note(row["id"])


def _create_notes_from_tree(
    notes_tree: list[dict],
    paper_id: Optional[str],
    website_id: Optional[str],
    github_repo_id: Optional[str] = None,
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
            github_repo_id=github_repo_id,
        )
        created.append(note)

        # Recurse into children for folders
        if note_type == "folder" and item.get("children"):
            children = _create_notes_from_tree(
                item["children"], paper_id, website_id, github_repo_id=github_repo_id, parent_id=note.id,
            )
            created.extend(children)

    return created


def _generate_multi_notes(
    paper_id: Optional[str],
    website_id: Optional[str],
    library_id: Optional[str],
    user_msg: str,
    github_repo_id: Optional[str] = None,
) -> list[Note]:
    """Core generation: call LLM, parse JSON tree, create folder structure."""
    custom_prompt = _get_custom_prompt(library_id)
    system = NOTE_GENERATION
    if custom_prompt:
        system += f"\n\nAdditional instructions from the researcher:\n{custom_prompt}"

    result = _call_openai_json(system, user_msg)
    notes_tree = result.get("notes", [])

    if not notes_tree:
        # Fallback: create a single summary note
        notes_tree = [{"name": "Summary", "type": "file", "content": "<p>No content generated.</p>"}]

    # Delete previous auto-generated notes
    _delete_auto_folder(paper_id, website_id, github_repo_id=github_repo_id)

    # Create the "AI Notes" root folder
    root_folder = create_note(
        NoteCreate(name=_AUTO_FOLDER_NAME, type="folder"),
        paper_id=paper_id,
        website_id=website_id,
        github_repo_id=github_repo_id,
    )

    # Create all notes inside the folder
    created = _create_notes_from_tree(
        notes_tree, paper_id, website_id, github_repo_id=github_repo_id, parent_id=root_folder.id,
    )

    logger.info(
        "Generated %d AI notes in folder %s (paper=%s website=%s repo=%s)",
        len(created), root_folder.id, paper_id, website_id, github_repo_id,
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


def generate_notes_for_github_repo(github_repo_id: str, library_id: Optional[str] = None) -> list[Note]:
    """Generate AI notes for a GitHub repo as a multi-file structure."""
    repo_row = get_client().table("github_repos").select("*").eq("id", github_repo_id).execute()
    if not repo_row.data:
        raise ValueError(f"GitHub repo {github_repo_id} not found")
    repo = repo_row.data[0]

    user_msg = f"Repository: {repo.get('owner', '')}/{repo.get('repo_name', '')}\n"
    user_msg += f"Title: {repo.get('title', 'Unknown')}\n"
    if repo.get("language"):
        user_msg += f"Language: {repo['language']}\n"
    topics = repo.get("topics") or []
    if topics:
        user_msg += f"Topics: {', '.join(topics)}\n"
    if repo.get("stars") is not None:
        user_msg += f"Stars: {repo['stars']}\n"
    user_msg += f"URL: {repo.get('url', '')}\n"
    if repo.get("abstract"):
        user_msg += f"\nAbstract:\n{repo['abstract']}"
    elif repo.get("description"):
        user_msg += f"\nDescription:\n{repo['description']}"

    return _generate_multi_notes(
        paper_id=None,
        website_id=None,
        github_repo_id=github_repo_id,
        library_id=library_id,
        user_msg=user_msg,
    )
