from typing import Optional

from models.base import CamelModel


class ChatMessage(CamelModel):
    id: str
    paper_id: str
    role: str  # 'user' | 'assistant'
    content: str
    created_at: str


class ChatMessageCreate(CamelModel):
    content: str
    context: Optional[str] = None  # optional note content for context
