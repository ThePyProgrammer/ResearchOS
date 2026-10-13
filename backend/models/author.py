from typing import Annotated, Optional

from pydantic import AfterValidator, Field, HttpUrl, TypeAdapter

from models.base import CamelModel
from models.lab import PaperLab
from models.paper import Paper


_PROFILE_URL = TypeAdapter(HttpUrl)


def _validate_profile_url(value: str) -> str:
    return str(_PROFILE_URL.validate_python(value))


ProfileUrl = Annotated[str, AfterValidator(_validate_profile_url)]


class Affiliation(CamelModel):
    institution: str
    role: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class AuthorLibrary(CamelModel):
    id: str
    name: str


class AuthorLab(CamelModel):
    id: str
    name: str
    is_member: bool = False
    is_pi: bool = False


class Author(CamelModel):
    id: str
    name: str
    name_normalized: str
    orcid: Optional[str] = None
    google_scholar_url: Optional[str] = None
    github_username: Optional[str] = None
    linkedin_url: Optional[ProfileUrl] = None
    twitter_url: Optional[ProfileUrl] = None
    openreview_url: Optional[str] = None
    website_url: Optional[str] = None
    emails: list[str] = []
    affiliations: list[Affiliation] = []
    created_at: str
    paper_count: int = 0
    libraries: list[AuthorLibrary] = []
    labs: list[AuthorLab] = []


class AuthorCreate(CamelModel):
    name: str
    orcid: Optional[str] = None
    google_scholar_url: Optional[str] = None
    github_username: Optional[str] = None
    linkedin_url: Optional[ProfileUrl] = None
    twitter_url: Optional[ProfileUrl] = None
    openreview_url: Optional[str] = None
    website_url: Optional[str] = None
    emails: list[str] = []
    affiliations: list[Affiliation] = []


class TopAuthor(CamelModel):
    name: str
    count: int
    author: Optional[Author] = None


class AuthorUpdate(CamelModel):
    name: Optional[str] = None
    orcid: Optional[str] = None
    google_scholar_url: Optional[str] = None
    github_username: Optional[str] = None
    linkedin_url: Optional[ProfileUrl] = None
    twitter_url: Optional[ProfileUrl] = None
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


class PaperAuthorReference(CamelModel):
    link: PaperAuthor
    author: Optional[Author] = None


class AuthorPaper(Paper):
    labs: list[PaperLab] = Field(default_factory=list)


class PaperAuthorNames(CamelModel):
    authors: list[str] = Field(default_factory=list)


class AuthorNameSuggestion(CamelModel):
    name: str
    paper_count: int = Field(ge=2)


class LinkedPaperAuthorName(CamelModel):
    raw_name: str = ""
    position: int = 0
    papers: Optional[PaperAuthorNames] = None
