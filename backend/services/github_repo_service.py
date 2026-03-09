import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from models.github_repo import GitHubRepo, GitHubRepoCreate, GitHubRepoUpdate
from services.db import get_client

logger = logging.getLogger(__name__)

_TABLE = "github_repos"


def list_github_repos(
    collection_id: Optional[str] = None,
    status: Optional[str] = None,
    library_id: Optional[str] = None,
) -> list[GitHubRepo]:
    query = get_client().table(_TABLE).select("*")
    if library_id:
        query = query.eq("library_id", library_id)
    query = query.order("published_date", desc=False)
    result = query.execute()
    repos = [GitHubRepo.model_validate(r) for r in result.data]

    if collection_id == "inbox":
        repos = [r for r in repos if r.status == "inbox"]
    elif collection_id and collection_id != "all":
        repos = [r for r in repos if collection_id in r.collections]
    if status:
        repos = [r for r in repos if r.status == status]
    return repos


def get_github_repo(repo_id: str) -> Optional[GitHubRepo]:
    result = get_client().table(_TABLE).select("*").eq("id", repo_id).execute()
    if not result.data:
        return None
    return GitHubRepo.model_validate(result.data[0])


def get_github_repo_by_url(url: str) -> Optional[GitHubRepo]:
    result = get_client().table(_TABLE).select("*").eq("url", url).execute()
    if not result.data:
        return None
    return GitHubRepo.model_validate(result.data[0])


def create_github_repo(data: GitHubRepoCreate) -> GitHubRepo:
    now = datetime.now(timezone.utc).isoformat()
    repo = GitHubRepo(
        id=f"gh_{uuid.uuid4().hex[:8]}",
        created_at=now,
        **data.model_dump(),
    )
    get_client().table(_TABLE).insert(repo.model_dump(by_alias=False)).execute()
    logger.info("Created github_repo %s: %s", repo.id, repo.title)
    return repo


def update_github_repo(repo_id: str, data: GitHubRepoUpdate) -> Optional[GitHubRepo]:
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_github_repo(repo_id)
    if get_github_repo(repo_id) is None:
        return None
    get_client().table(_TABLE).update(updates).eq("id", repo_id).execute()
    logger.info("Updated github_repo %s: %s", repo_id, list(updates.keys()))
    return get_github_repo(repo_id)


def delete_github_repo(repo_id: str) -> bool:
    if get_github_repo(repo_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", repo_id).execute()
    logger.info("Deleted github_repo %s", repo_id)
    return True
