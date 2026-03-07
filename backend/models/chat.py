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
    role: str  # 'user' | 'assistant'
    content: str
    suggestions: Optional[list[dict]] = None
    created_at: str


class ChatMessageCreate(CamelModel):
    content: str
    context: Optional[str] = None  # optional note content for context
    notes_context: Optional[list[dict]] = None  # [{id, name, type, parentId, content}]
