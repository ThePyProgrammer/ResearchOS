import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.chat import ChatMessageCreate
from services import chat_service
from services import pdf_text_service
from services.db import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


# ─── Website chat ─────────────────────────────────────────────────────────────

@router.get("/websites/{website_id}/chat")
async def list_website_chat(website_id: str):
    messages = chat_service.list_messages_for_website(website_id)
    return JSONResponse([m.model_dump(by_alias=True) for m in messages])


@router.post("/websites/{website_id}/chat", status_code=201)
async def send_website_chat(website_id: str, data: ChatMessageCreate):
    result = get_client().table("websites").select("title,url,description,authors").eq("id", website_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Website not found")

    site = result.data[0]
    assistant_msg = chat_service.generate_response_for_website(
        website_id=website_id,
        user_content=data.content,
        website_title=site.get("title", ""),
        website_url=site.get("url", ""),
        website_description=site.get("description"),
        website_authors=site.get("authors") or [],
        notes_context=data.notes_context,
    )
    return JSONResponse(assistant_msg.model_dump(by_alias=True), status_code=201)


@router.delete("/websites/{website_id}/chat", status_code=204)
async def clear_website_chat(website_id: str):
    chat_service.clear_history_for_website(website_id)


@router.get("/papers/{paper_id}/chat")
async def list_chat(paper_id: str):
    messages = chat_service.list_messages(paper_id)
    return JSONResponse([m.model_dump(by_alias=True) for m in messages])


@router.post("/papers/{paper_id}/chat", status_code=201)
async def send_chat(paper_id: str, data: ChatMessageCreate):
    # Fetch paper for context
    result = get_client().table("papers").select("title,abstract,pdf_url").eq("id", paper_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")

    paper = result.data[0]
    assistant_msg = chat_service.generate_response(
        paper_id=paper_id,
        user_content=data.content,
        paper_title=paper.get("title", ""),
        paper_abstract=paper.get("abstract", ""),
        pdf_url=paper.get("pdf_url"),
        note_context=data.context,
        notes_context=data.notes_context,
    )
    return JSONResponse(assistant_msg.model_dump(by_alias=True), status_code=201)


@router.delete("/papers/{paper_id}/chat", status_code=204)
async def clear_chat(paper_id: str):
    chat_service.clear_history(paper_id)


# ─── GitHub Repo chat ─────────────────────────────────────────────────────────

@router.get("/github-repos/{repo_id}/chat")
async def list_github_repo_chat(repo_id: str):
    messages = chat_service.list_messages_for_github_repo(repo_id)
    return JSONResponse([m.model_dump(by_alias=True) for m in messages])


@router.post("/github-repos/{repo_id}/chat", status_code=201)
async def send_github_repo_chat(repo_id: str, data: ChatMessageCreate):
    result = get_client().table("github_repos").select(
        "title,url,owner,repo_name,description,abstract,language,topics,stars"
    ).eq("id", repo_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="GitHub repo not found")

    repo = result.data[0]
    assistant_msg = chat_service.generate_response_for_github_repo(
        github_repo_id=repo_id,
        user_content=data.content,
        repo_title=repo.get("title", ""),
        repo_url=repo.get("url", ""),
        repo_owner=repo.get("owner", ""),
        repo_name=repo.get("repo_name", ""),
        repo_description=repo.get("description"),
        repo_abstract=repo.get("abstract"),
        repo_language=repo.get("language"),
        repo_topics=repo.get("topics") or [],
        repo_stars=repo.get("stars"),
        notes_context=data.notes_context,
    )
    return JSONResponse(assistant_msg.model_dump(by_alias=True), status_code=201)


@router.delete("/github-repos/{repo_id}/chat", status_code=204)
async def clear_github_repo_chat(repo_id: str):
    chat_service.clear_history_for_github_repo(repo_id)


@router.get("/papers/{paper_id}/text")
async def get_paper_text(paper_id: str):
    """Return extracted text for a paper, or null if not yet extracted."""
    cached = pdf_text_service.get_cached_text(paper_id)
    if cached:
        return JSONResponse({
            "paperId": paper_id,
            "pageCount": cached["page_count"],
            "extractedAt": cached["extracted_at"],
            "charCount": len(cached.get("markdown", "")),
        })
    return JSONResponse({"paperId": paper_id, "pageCount": None, "extractedAt": None, "charCount": 0})


@router.post("/papers/{paper_id}/text")
async def extract_paper_text(paper_id: str):
    """Extract text from the paper's PDF. Returns extraction metadata."""
    result = get_client().table("papers").select("pdf_url").eq("id", paper_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")
    pdf_url = result.data[0].get("pdf_url")
    if not pdf_url:
        raise HTTPException(status_code=400, detail="Paper has no PDF uploaded")
    try:
        cached = pdf_text_service.extract_and_cache(paper_id, pdf_url)
        return JSONResponse({
            "paperId": paper_id,
            "pageCount": cached["page_count"],
            "extractedAt": cached["extracted_at"],
            "charCount": len(cached.get("markdown", "")),
        })
    except Exception as e:
        logger.exception("Text extraction failed for paper %s", paper_id)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")
