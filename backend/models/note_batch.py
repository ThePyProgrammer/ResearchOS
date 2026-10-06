from pydantic import Field, model_validator

from models.base import CamelModel
from models.bulk_items import BulkItem
from models.note import Note


class NoteBatchRequest(CamelModel):
    items: list[BulkItem] = Field(min_length=1, max_length=100)

    @model_validator(mode='after')
    def unique_sources(self):
        if len({(item.item_type, item.id) for item in self.items}) != len(self.items):
            raise ValueError('Note sources must be unique')
        return self


class ItemNotes(BulkItem):
    notes: list[Note] = []
