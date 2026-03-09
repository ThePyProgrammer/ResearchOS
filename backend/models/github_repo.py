from typing import Optional
from .base import CamelModel
from .paper import NamedLink


class GitHubRepo(CamelModel):
    id: str
    title: str
    url: str
    owner: str
    repo_name: str
    description: Optional[str] = None
    abstract: Optional[str] = None
    stars: Optional[int] = None
    language: Optional[str] = None
    topics: list[str] = []
    authors: list[str] = []
    published_date: Optional[str] = None
    version: Optional[str] = None
    doi: Optional[str] = None
    license: Optional[str] = None
    website_url: Optional[str] = None
    links: list[NamedLink] = []
    tags: list[str] = []
    status: str = "inbox"
    source: str = "human"
    collections: list[str] = []
    library_id: Optional[str] = None
    created_at: str
    item_type: str = "github_repo"


class GitHubRepoCreate(CamelModel):
    title: str
    url: str
    owner: str
    repo_name: str
    description: Optional[str] = None
    abstract: Optional[str] = None
    stars: Optional[int] = None
    language: Optional[str] = None
    topics: list[str] = []
    authors: list[str] = []
    published_date: Optional[str] = None
    version: Optional[str] = None
    doi: Optional[str] = None
    license: Optional[str] = None
    website_url: Optional[str] = None
    links: list[NamedLink] = []
    tags: list[str] = []
    status: str = "inbox"
    source: str = "human"
    collections: list[str] = []
    library_id: Optional[str] = None


class GitHubRepoUpdate(CamelModel):
    title: Optional[str] = None
    description: Optional[str] = None
    abstract: Optional[str] = None
    stars: Optional[int] = None
    language: Optional[str] = None
    topics: Optional[list[str]] = None
    authors: Optional[list[str]] = None
    published_date: Optional[str] = None
    version: Optional[str] = None
    doi: Optional[str] = None
    license: Optional[str] = None
    website_url: Optional[str] = None
    links: Optional[list[NamedLink]] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None
    collections: Optional[list[str]] = None
