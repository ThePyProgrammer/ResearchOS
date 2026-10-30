from typing import Literal, Optional
from pydantic import model_validator
from .canvas import validate_canvas
from .base import CamelModel


class Note(CamelModel):
    id: str
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    github_repo_id: Optional[str] = None
    library_id: Optional[str] = None
    project_id: Optional[str] = None
    experiment_id: Optional[str] = None
    name: str
    parent_id: Optional[str] = None
    type: str = "file"  # file | folder | canvas
    content: str = ""
    is_pinned: bool = False
    created_at: str
    updated_at: str


class NoteCreate(CamelModel):
    name: str
    parent_id: Optional[str] = None
    type: Literal["file", "folder", "canvas"] = "file"
    content: str = ""

    @model_validator(mode="after")
    def validate_document(self):
        if self.type == "canvas":
            self.content = validate_canvas(self.content or '{"nodes":[],"edges":[]}')
            if not self.name.lower().endswith(".canvas"):
                self.name += ".canvas"
        return self


class NoteUpdate(CamelModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    content: Optional[str] = None
    is_pinned: Optional[bool] = None
    # Source reassignment — for moving notes between papers / websites / repos / library / projects
    paper_id: Optional[str] = None
    website_id: Optional[str] = None
    github_repo_id: Optional[str] = None
    library_id: Optional[str] = None
    project_id: Optional[str] = None
