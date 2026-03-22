"""Batch processing services for bulk embedding indexing and notes preview.

Two functions:

- ``batch_index_embeddings(item_ids)`` — indexes items via search_service
  for each found paper/website/github_repo. Returns processed/not_found counts.
- ``batch_notes_preview(item_ids)`` — checks the notes table for existing
  "AI Notes" folders and returns skip_ids (have folder) and process_ids (don't).
"""
from __future__ import annotations

import logging

from services import github_repo_service, paper_service, search_service, website_service
from services.db import get_client

logger = logging.getLogger(__name__)

_AI_NOTES_FOLDER = "AI Notes"


async def batch_index_embeddings(item_ids: list[str]) -> dict:
    """Index embeddings for an explicit list of item IDs.

    For each item_id, classifies by prefix and calls the corresponding
    index function from search_service. search_service internally skips
    items that already have cached embeddings.

    Args:
        item_ids: List of paper/website/github_repo IDs.

    Returns:
        A dict with keys ``processed`` (found and indexed) and
        ``not_found`` (IDs that resolved to None in the DB).
    """
    processed = 0
    not_found = 0

    for item_id in item_ids:
        if item_id.startswith("w_"):
            item = website_service.get_website(item_id)
            if item is None:
                not_found += 1
                continue
            await search_service.index_website(item)
        elif item_id.startswith("gh_"):
            item = github_repo_service.get_github_repo(item_id)
            if item is None:
                not_found += 1
                continue
            await search_service.index_github_repo(item)
        else:
            item = paper_service.get_paper(item_id)
            if item is None:
                not_found += 1
                continue
            await search_service.index_paper(item)

        processed += 1
        logger.debug("Indexed embeddings for item %s", item_id)

    logger.info(
        "batch_index_embeddings complete: %d processed, %d not_found",
        processed,
        not_found,
    )

    return {"processed": processed, "not_found": not_found}


def batch_notes_preview(item_ids: list[str]) -> dict:
    """Preview which items will be skipped for bulk note generation.

    Queries the notes table for all existing "AI Notes" folders matching
    the given item IDs. Per user decision: items with existing AI notes
    folders are skipped — not overwritten.

    Args:
        item_ids: List of paper/website/github_repo IDs to check.

    Returns:
        A dict with keys:
        - ``skip_ids``: item IDs that already have an "AI Notes" folder
        - ``process_ids``: item IDs that do not have an "AI Notes" folder
    """
    if not item_ids:
        return {"skip_ids": [], "process_ids": []}

    # Query all AI Notes folders across all item types in one request
    result = (
        get_client()
        .table("notes")
        .select("paper_id, website_id, github_repo_id")
        .eq("name", _AI_NOTES_FOLDER)
        .eq("type", "folder")
        .execute()
    )

    # Build a set of item IDs that already have AI Notes folders
    has_ai_notes: set[str] = set()
    for row in result.data:
        if row.get("paper_id"):
            has_ai_notes.add(row["paper_id"])
        if row.get("website_id"):
            has_ai_notes.add(row["website_id"])
        if row.get("github_repo_id"):
            has_ai_notes.add(row["github_repo_id"])

    skip_ids = []
    process_ids = []

    for item_id in item_ids:
        if item_id in has_ai_notes:
            skip_ids.append(item_id)
        else:
            process_ids.append(item_id)

    logger.info(
        "batch_notes_preview: %d will be skipped (have AI Notes), %d will be processed",
        len(skip_ids),
        len(process_ids),
    )

    return {"skip_ids": skip_ids, "process_ids": process_ids}
