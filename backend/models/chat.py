from typing import Optional

from models.base import CamelModel


class NoteSuggestion(CamelModel):
    id: str
    type: str  # 'edit' | 'create'
    note_id: Optional[str] = None
    note_name: str
    parent_id: Optional[str] = None
    content: str  # proposed HTML content
    description: str
    status: str = "pending"  # 'pending' | 'accepted' | 'rejected'


class ChatMessage(CamelModel):
    id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    github_repo_id: Optional[str] = None
    library_id: Optional[str] = None  # used by the Notes-page copilot
    role: str  # 'user' | 'assistant'
    content: str
    suggestions: Optional[list[dict]] = None
    created_at: str


class ChatMessageCreate(CamelModel):
    content: str
    context: Optional[str] = None  # optional note content for context
    notes_context: Optional[list[dict]] = None  # [{id, name, type, parentId, content}]


# ── Notes-page copilot ────────────────────────────────────────────────────────

class NotesCopilotContextItemNote(CamelModel):
    """A single note sent as part of the context for the Notes copilot."""
    id: str
    name: str
    type: str  # 'file' | 'folder'
    parent_id: Optional[str] = None
    content: Optional[str] = None


class NotesCopilotContextItem(CamelModel):
    """One context item (paper / website / github_repo / library) selected via @."""
    type: str  # 'paper' | 'website' | 'github_repo' | 'library'
    id: str
    name: str
    metadata: Optional[dict] = None  # item-specific fields (title, abstract, url, …)
    notes: Optional[list[NotesCopilotContextItemNote]] = None
    include_pdf: Optional[bool] = False  # if True and type=='paper', inject full PDF text


class NotesCopilotMessageCreate(CamelModel):
    content: str
    context_items: list[NotesCopilotContextItem] = []
    # Full conversation history from the frontend (stateless API approach).
    # Each entry: {role: 'user'|'assistant', content: str}
    history: list[dict] = []
