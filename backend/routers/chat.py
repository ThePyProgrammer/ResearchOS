import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.chat import ChatMessageCreate
from services import chat_service
from services import pdf_text_service
from services.db import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


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
