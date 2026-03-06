from typing import Optional
from .base import CamelModel


class AgentRunRef(CamelModel):
    id: str
    name: str
    run_number: int


class Paper(CamelModel):
    id: str
    title: str
    authors: list[str]
    year: int
    venue: str
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    status: str  # inbox, to-read, read
    tags: list[str] = []
    abstract: Optional[str] = None
    source: str  # human, agent
    agent_run: Optional[AgentRunRef] = None
    relevance_score: Optional[int] = None
    agent_reasoning: Optional[str] = None
    rejected: bool = False
    collections: list[str] = []
    pdf_url: Optional[str] = None
    github_url: Optional[str] = None
    website_url: Optional[str] = None
    created_at: str


class PaperCreate(CamelModel):
    title: str
    authors: list[str]
    year: int
    venue: str
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    status: str = "inbox"
    tags: list[str] = []
    abstract: Optional[str] = None
    source: str = "human"
    agent_run: Optional[AgentRunRef] = None
    relevance_score: Optional[int] = None
    agent_reasoning: Optional[str] = None
    collections: list[str] = []
    pdf_url: Optional[str] = None
    github_url: Optional[str] = None
    website_url: Optional[str] = None


class PaperUpdate(CamelModel):
    status: Optional[str] = None
    tags: Optional[list[str]] = None
    collections: Optional[list[str]] = None
    rejected: Optional[bool] = None
    agent_run: Optional[AgentRunRef] = None
    relevance_score: Optional[int] = None
    agent_reasoning: Optional[str] = None
    github_url: Optional[str] = None
    website_url: Optional[str] = None
