from typing import Annotated, Optional

from pydantic import AfterValidator, Field, HttpUrl, StringConstraints, TypeAdapter, field_validator

from models.base import CamelModel


LabName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
RecordId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _website_url(value: str) -> str:
    url = TypeAdapter(HttpUrl).validate_python(value)
    if url.username or url.password:
        raise ValueError("Website URLs cannot contain credentials")
    return str(url)


WebsiteUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2083), AfterValidator(_website_url)]


class LabCreate(CamelModel):
    name: LabName
    description: Optional[str] = Field(None, max_length=5000)
    websites: list[WebsiteUrl] = Field(default_factory=list, max_length=20)
    pi_author_ids: list[RecordId] = Field(default_factory=list, max_length=50)


class LabUpdate(CamelModel):
    name: Optional[LabName] = None
    description: Optional[str] = Field(None, max_length=5000)
    websites: list[WebsiteUrl] = Field(default_factory=list, max_length=20)
    pi_author_ids: list[RecordId] = Field(default_factory=list, max_length=50)

    @field_validator("name")
    @classmethod
    def name_cannot_be_null(cls, value):
        if value is None:
            raise ValueError("name cannot be null")
        return value


class Lab(CamelModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: str
    websites: list[WebsiteUrl] = Field(default_factory=list)


class LabMember(CamelModel):
    author_id: str
    name: str
    orcid: Optional[str] = None


class LabDetail(Lab):
    principal_investigators: list[LabMember] = Field(default_factory=list)


class LabPage(CamelModel):
    items: list[LabDetail]
    total: int
    limit: int
    offset: int


class LabMemberPage(CamelModel):
    items: list[LabMember]
    total: int
    limit: int
    offset: int


class LabPaper(CamelModel):
    id: str
    title: str
    authors: list[str]
    year: int
    venue: str
    status: str
    library_id: Optional[str] = None
    library_name: Optional[str] = None


class LabPaperPage(CamelModel):
    items: list[LabPaper]
    total: int
    limit: int
    offset: int


class LabPaperSelection(CamelModel):
    paper_ids: list[RecordId] = Field(min_length=1, max_length=100)
    author_id: Optional[RecordId] = None


class LabPaperAddResult(CamelModel):
    added_count: int
