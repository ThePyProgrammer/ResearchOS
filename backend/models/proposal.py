from typing import Optional, Any
from .base import CamelModel
from .paper import Paper


class Proposal(CamelModel):
    id: str
    paper_id: str
    run_id: str
    status: str  # pending, approved, rejected
    checked: bool = True


class ProposalResponse(CamelModel):
    id: str
    paper_id: str
    run_id: str
    status: str
    checked: bool
    paper: Paper


class BatchAction(CamelModel):
    ids: list[str]
    action: str  # approve, reject
