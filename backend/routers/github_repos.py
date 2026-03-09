import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.github_repo import GitHubRepoCreate, GitHubRepoUpdate
from services import github_repo_service
from services import activity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/github-repos", tags=["github-repos"])

NOT_FOUND = {"error": "not_found", "detail": "GitHub repository not found"}


@router.get("")
async def list_github_repos(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    library_id: Optional[str] = None,
):
    repos = github_repo_service.list_github_repos(
        collection_id=collection_id,
        status=status,
        library_id=library_id,
    )
    return JSONResponse([r.model_dump(by_alias=True) for r in repos])


@router.post("", status_code=201)
async def create_github_repo(data: GitHubRepoCreate):
    repo = github_repo_service.create_github_repo(data)
    activity_service.log_activity(
        type="human",
        icon="code",
        icon_color="text-violet-600",
        icon_bg="bg-violet-50",
        title=f"Added \"{repo.title}\"",
        detail=repo.url,
        action_label="View",
        action_href=repo.url,
        library_id=repo.library_id,
    )
    return JSONResponse(repo.model_dump(by_alias=True), status_code=201)


# ---------------------------------------------------------------------------
# Import: fetch GitHub repo metadata (+ CITATION.cff) and add to library
# ---------------------------------------------------------------------------

class GitHubRepoImportRequest(BaseModel):
    url: str
    library_id: Optional[str] = None


@router.post("/import", status_code=201)
async def import_github_repo(data: GitHubRepoImportRequest):
    """Fetch a GitHub repo's metadata and CITATION.cff, then add it to the library."""
    from services.import_service import resolve_github_repo

    url = data.url.strip()
    if not url:
        raise HTTPException(status_code=422, detail="url must not be empty")
    if "github.com/" not in url:
        raise HTTPException(status_code=422, detail="url must be a GitHub repository URL")

    # Normalize to canonical repo URL before dedup check
    import re
    m = re.search(r"github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$", url)
    if not m:
        raise HTTPException(status_code=422, detail="Could not parse GitHub repository URL")
    canonical_url = f"https://github.com/{m.group(1)}/{m.group(2)}"

    existing = github_repo_service.get_github_repo_by_url(canonical_url)
    if existing:
        return JSONResponse(
            {**existing.model_dump(by_alias=True), "already_exists": True},
            status_code=200,
        )

    try:
        meta = await resolve_github_repo(url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error fetching GitHub repo '%s'", url)
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch GitHub repository metadata: {exc}",
        ) from exc

    repo_create = GitHubRepoCreate(
        title=meta["title"],
        url=meta["url"],
        owner=meta["owner"],
        repo_name=meta["repo_name"],
        description=meta.get("description"),
        abstract=meta.get("abstract"),
        stars=meta.get("stars"),
        language=meta.get("language"),
        topics=meta.get("topics") or [],
        authors=meta.get("authors") or [],
        published_date=meta.get("published_date"),
        version=meta.get("version"),
        doi=meta.get("doi"),
        license=meta.get("license"),
        tags=meta.get("topics") or [],
        status="inbox",
        source="human",
        library_id=data.library_id,
    )
    repo = github_repo_service.create_github_repo(repo_create)
    logger.info("Imported GitHub repo '%s' from '%s'", repo.title, url)
    activity_service.log_activity(
        type="human",
        icon="code",
        icon_color="text-violet-600",
        icon_bg="bg-violet-50",
        title=f"Imported \"{repo.title}\"",
        detail=repo.url,
        action_label="View",
        action_href=repo.url,
        library_id=repo.library_id,
    )
    return JSONResponse(
        {**repo.model_dump(by_alias=True), "already_exists": False},
        status_code=201,
    )


@router.get("/{repo_id}")
async def get_github_repo(repo_id: str):
    repo = github_repo_service.get_github_repo(repo_id)
    if repo is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(repo.model_dump(by_alias=True))


@router.patch("/{repo_id}")
async def update_github_repo(repo_id: str, data: GitHubRepoUpdate):
    repo = github_repo_service.update_github_repo(repo_id, data)
    if repo is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return JSONResponse(repo.model_dump(by_alias=True))


@router.delete("/{repo_id}", status_code=204)
async def delete_github_repo(repo_id: str):
    deleted = github_repo_service.delete_github_repo(repo_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
