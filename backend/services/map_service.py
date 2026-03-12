"""
Library Map service — UMAP 2D projection of cached item embeddings.

For each library the UMAP layout is computed once from the cached embeddings
in ``data/embeddings.json`` and stored in ``data/map_cache.json``.  The cache
entry is keyed by library_id (or ``"__all__"`` for no filter) and is
invalidated whenever the set of embedded items for that scope changes —
identified by a short SHA-256 signature over the sorted embedding keys.

UMAP is run in a thread-pool executor so the async event loop is never blocked.
"""

import asyncio
import hashlib
import logging
from typing import Optional

import numpy as np

from models.github_repo import GitHubRepo
from models.paper import Paper
from models.website import Website
from services.search_service import _embed_cache_key, _load_embeddings
from services.storage import load_json, save_json

logger = logging.getLogger(__name__)

_MAP_CACHE_FILE = "map_cache.json"


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _load_map_cache() -> dict:
    try:
        raw = load_json(_MAP_CACHE_FILE)
        return raw if isinstance(raw, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _save_map_cache(cache: dict) -> None:
    save_json(_MAP_CACHE_FILE, cache)


def _signature(keys: list[str]) -> str:
    """Stable 16-char hash of a sorted list of embedding cache keys."""
    joined = ",".join(sorted(keys))
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Projection helpers
# ---------------------------------------------------------------------------

def _run_umap(matrix: np.ndarray) -> np.ndarray:
    """Run UMAP synchronously (called inside an executor)."""
    import umap  # deferred — heavy import

    n = len(matrix)
    if n < 2:
        return np.zeros((n, 2), dtype=np.float32)

    if n < 5:
        # Too few points for meaningful UMAP; spread on a circle instead.
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False)
        coords = np.column_stack([np.cos(angles), np.sin(angles)]).astype(np.float32)
        return coords

    n_neighbors = min(15, n - 1)
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
        low_memory=True,
    )
    return reducer.fit_transform(matrix).astype(np.float32)


def _normalise(coords: np.ndarray) -> np.ndarray:
    """Normalise each axis to [-1, 1]."""
    out = coords.copy()
    for dim in range(out.shape[1]):
        col = out[:, dim]
        lo, hi = float(col.min()), float(col.max())
        if hi > lo:
            out[:, dim] = 2 * (col - lo) / (hi - lo) - 1
    return out


# ---------------------------------------------------------------------------
# Per-type helpers
# ---------------------------------------------------------------------------

def _item_title(item) -> str:
    return getattr(item, "title", "") or ""


def _item_url(item) -> Optional[str]:
    if isinstance(item, Paper):
        return item.pdf_url or item.website_url or None
    if isinstance(item, Website):
        return item.url
    if isinstance(item, GitHubRepo):
        return item.url
    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def build_map(library_id: Optional[str] = None) -> list[dict]:
    """
    Return a list of map-point dicts for all embedded items in a library.

    Each dict contains: ``id``, ``x``, ``y``, ``title``, ``itemType``,
    ``collections``, ``url``.

    The UMAP layout is cached in ``data/map_cache.json`` and regenerated only
    when the set of embedded items changes.

    Raises ``RuntimeError`` if ``umap-learn`` is not installed.
    """
    # Validate umap-learn is available before doing expensive DB work.
    try:
        import umap  # noqa: F401
    except ImportError:
        raise RuntimeError(
            "umap-learn is not installed. Install it with:  uv add umap-learn"
        )

    from services.github_repo_service import list_github_repos
    from services.paper_service import list_papers
    from services.website_service import list_websites

    papers = list_papers(library_id=library_id)
    websites = list_websites(library_id=library_id)
    repos = list_github_repos(library_id=library_id)

    all_items: list = [*papers, *websites, *repos]
    if not all_items:
        return []

    embeddings = _load_embeddings()

    # Pair each item with its embedding key; keep only items that have one.
    paired: list[tuple] = [
        (item, _embed_cache_key(item))
        for item in all_items
        if _embed_cache_key(item) in embeddings
    ]

    if not paired:
        return []

    # Check cache for a valid hit.
    cache_key = library_id or "__all__"
    cache = _load_map_cache()
    current_sig = _signature([k for _, k in paired])

    entry = cache.get(cache_key, {})
    if entry.get("signature") == current_sig and entry.get("points"):
        # Refresh mutable metadata (title / collections) without rerunning UMAP.
        item_by_embed_key = {k: item for item, k in paired}
        refreshed = []
        for pt in entry["points"]:
            ek = pt.get("embedKey", "")
            item = item_by_embed_key.get(ek)
            if item is None:
                continue
            refreshed.append({
                "id": pt["id"],
                "x": pt["x"],
                "y": pt["y"],
                "title": _item_title(item),
                "itemType": item.item_type,
                "collections": item.collections,
                "url": _item_url(item),
            })
        return refreshed

    # Cache miss — run UMAP in a thread so we don't block the event loop.
    keys = [k for _, k in paired]
    matrix = np.array([embeddings[k] for k in keys], dtype=np.float32)

    logger.info("Building library map: %d items, library_id=%s", len(matrix), library_id)
    loop = asyncio.get_event_loop()
    raw_coords = await loop.run_in_executor(None, _run_umap, matrix)
    coords = _normalise(raw_coords)

    points: list[dict] = []
    for i, (item, emb_key) in enumerate(paired):
        points.append({
            "id": item.id,
            "embedKey": emb_key,
            "x": round(float(coords[i, 0]), 6),
            "y": round(float(coords[i, 1]), 6),
            "title": _item_title(item),
            "itemType": item.item_type,
            "collections": item.collections,
            "url": _item_url(item),
        })

    # Persist cache entry.
    cache[cache_key] = {"signature": current_sig, "points": points}
    _save_map_cache(cache)
    logger.info("Library map built and cached (%d points)", len(points))

    # Strip internal embedKey before returning to the API layer.
    return [
        {k: v for k, v in pt.items() if k != "embedKey"}
        for pt in points
    ]


def invalidate_map_cache(library_id: Optional[str] = None) -> None:
    """
    Drop the cached UMAP layout for a library.

    Called after new items are indexed so the next map request recomputes the
    projection with the updated embedding set.
    """
    cache_key = library_id or "__all__"
    cache = _load_map_cache()
    if cache_key in cache:
        del cache[cache_key]
        # Also invalidate the "__all__" bucket when a specific library changes.
        if library_id and "__all__" in cache:
            del cache["__all__"]
        _save_map_cache(cache)
        logger.info("Invalidated map cache for library_id=%s", library_id)
