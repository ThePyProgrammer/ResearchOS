from typing import Optional
from .base import CamelModel


class Website(CamelModel):
    id: str
    title: str
    url: str
    authors: list[str] = []
    published_date: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = []
    status: str = "inbox"
    source: str = "human"
    github_url: Optional[str] = None
    collections: list[str] = []
    library_id: Optional[str] = None
    created_at: str
    item_type: str = "website"


class WebsiteCreate(CamelModel):
    title: str
    url: str
    authors: list[str] = []
    published_date: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = []
    status: str = "inbox"
    source: str = "human"
    github_url: Optional[str] = None
    collections: list[str] = []
    library_id: Optional[str] = None


class WebsiteUpdate(CamelModel):
    title: Optional[str] = None
    url: Optional[str] = None
    authors: Optional[list[str]] = None
    published_date: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None
    github_url: Optional[str] = None
    collections: Optional[list[str]] = None
