from typing import Optional

from .base import CamelModel


class Affiliation(CamelModel):
    institution: str
    role: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class AuthorLibrary(CamelModel):
    id: str
    name: str


class Author(CamelModel):
    id: str
    name: str
    name_normalized: str
    orcid: Optional[str] = None
    google_scholar_url: Optional[str] = None
    github_username: Optional[str] = None
    openreview_url: Optional[str] = None
    website_url: Optional[str] = None
    emails: list[str] = []
    affiliations: list[Affiliation] = []
    created_at: str
    paper_count: int = 0
    libraries: list[AuthorLibrary] = []


class AuthorCreate(CamelModel):
    name: str
    orcid: Optional[str] = None
    google_scholar_url: Optional[str] = None
    github_username: Optional[str] = None
    openreview_url: Optional[str] = None
    website_url: Optional[str] = None
    emails: list[str] = []
    affiliations: list[Affiliation] = []


class AuthorUpdate(CamelModel):
    name: Optional[str] = None
    orcid: Optional[str] = None
    google_scholar_url: Optional[str] = None
    github_username: Optional[str] = None
    openreview_url: Optional[str] = None
    website_url: Optional[str] = None
    emails: Optional[list[str]] = None
    affiliations: Optional[list[Affiliation]] = None


class PaperAuthor(CamelModel):
    id: str
    paper_id: str
    author_id: str
    position: int = 0
    raw_name: str = ""
    created_at: str


class AuthorSearchResult(CamelModel):
    id: str
    name: str
    current_affiliation: Optional[str] = None
    orcid: Optional[str] = None
    paper_count: int = 0
