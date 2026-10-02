from typing import Literal, Optional

from pydantic import Field, field_validator, model_validator

from models.base import CamelModel


class BulkItem(CamelModel):
    id: str = Field(min_length=1, max_length=200)
    item_type: Literal['paper', 'website', 'github_repo'] = 'paper'

    @field_validator('id')
    @classmethod
    def nonblank_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError('Item ID must not be blank')
        return value


class BulkItemsRequest(CamelModel):
    items: list[BulkItem] = Field(min_length=1, max_length=100)
    action: Literal['status', 'add_to_collection', 'delete']
    status: Optional[Literal['inbox', 'to-read', 'read']] = None
    collection_id: Optional[str] = Field(default=None, min_length=1, max_length=200)
    library_id: Optional[str] = None

    @model_validator(mode='after')
    def validate_action(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError('Item IDs must be unique')
        if self.action == 'status' and self.status is None:
            raise ValueError('Status is required')
        if self.action == 'add_to_collection' and not self.collection_id:
            raise ValueError('Collection is required')
        return self


class BulkItemFailure(CamelModel):
    id: str
    detail: str


class BulkItemsResult(CamelModel):
    succeeded_ids: list[str] = []
    failed: list[BulkItemFailure] = []


class ItemCollections(CamelModel):
    id: str
    collections: list[str] = []
