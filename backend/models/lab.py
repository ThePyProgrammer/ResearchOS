from typing import Annotated, Optional

from pydantic import Field, StringConstraints, field_validator

from models.base import CamelModel


LabName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class LabCreate(CamelModel):
    name: LabName
    description: Optional[str] = Field(None, max_length=5000)


class LabUpdate(CamelModel):
    name: Optional[LabName] = None
    description: Optional[str] = Field(None, max_length=5000)

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


class LabPage(CamelModel):
    items: list[Lab]
    total: int
    limit: int
    offset: int


class LabMember(CamelModel):
    author_id: str
    name: str
    orcid: Optional[str] = None


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


RecordId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class LabPaperSelection(CamelModel):
    paper_ids: list[RecordId] = Field(min_length=1, max_length=100)
    author_id: Optional[RecordId] = None


class LabPaperAddResult(CamelModel):
    added_count: int
