import json
import logging

from fastapi import HTTPException

from models.bulk_items import BulkItemFailure, BulkItemsRequest, BulkItemsResult, ItemCollections
from services.db import get_client

logger = logging.getLogger(__name__)
_TABLES = {'paper': 'papers', 'website': 'websites', 'github_repo': 'github_repos'}


def mutate_items(data: BulkItemsRequest) -> BulkItemsResult:
    """Bounded, set-based writes with explicit results for every requested item."""
    db = get_client()
    result = BulkItemsResult()
    if data.action == 'add_to_collection':
        query = db.table('collections').select('id').eq('id', data.collection_id)
        if data.library_id:
            query = query.eq('library_id', data.library_id)
        if not query.execute().data:
            raise HTTPException(404, detail={'error': 'not_found', 'detail': 'Collection not found'})

    for item_type, table in _TABLES.items():
        ids = [item.id for item in data.items if item.item_type == item_type]
        if not ids:
            continue
        succeeded: set[str] = set()
        try:
            if data.action == 'add_to_collection':
                query = db.table(table).select('id,collections').in_('id', ids)
                if data.library_id:
                    query = query.eq('library_id', data.library_id)
                rows = [ItemCollections.model_validate(row) for row in query.execute().data]
                groups: dict[tuple[str, ...], list[str]] = {}
                for row in rows:
                    if data.collection_id in row.collections:
                        succeeded.add(row.id)
                    else:
                        memberships = tuple([*row.collections, data.collection_id])
                        groups.setdefault(memberships, []).append(row.id)
                # Preserve each item's existing memberships; never upsert stale
                # full records or overwrite unrelated metadata.
                for memberships, group_ids in groups.items():
                    query = db.table(table).update({'collections': list(memberships)}).in_('id', group_ids)
                    # If another writer changed memberships after the read,
                    # report a conflict rather than erase that writer's change.
                    query = query.eq('collections', json.dumps(list(memberships[:-1])))
                    if data.library_id:
                        query = query.eq('library_id', data.library_id)
                    succeeded.update(row['id'] for row in query.execute().data)
            else:
                query = db.table(table)
                query = query.delete() if data.action == 'delete' else query.update({'status': data.status})
                query = query.in_('id', ids)
                if data.library_id:
                    query = query.eq('library_id', data.library_id)
                succeeded.update(row['id'] for row in query.execute().data)
            detail = 'Item missing, inaccessible, or changed concurrently. Refresh and retry.'
        except Exception:
            logger.exception('Bulk %s failed for %s (%d items)', data.action, table, len(ids))
            detail = 'Update could not be confirmed. Refresh and retry this item.'
        result.succeeded_ids.extend(item_id for item_id in ids if item_id in succeeded)
        result.failed.extend(BulkItemFailure(id=item_id, detail=detail) for item_id in ids if item_id not in succeeded)
    logger.info('Bulk %s: %d succeeded, %d failed', data.action, len(result.succeeded_ids), len(result.failed))
    return result
