import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from models.chat import ChatMessageCreate
from services import chat_service
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
    result = get_client().table("papers").select("title,abstract").eq("id", paper_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")

    paper = result.data[0]
    assistant_msg = chat_service.generate_response(
        paper_id=paper_id,
        user_content=data.content,
        paper_title=paper.get("title", ""),
        paper_abstract=paper.get("abstract", ""),
        note_context=data.context,
    )
    return JSONResponse(assistant_msg.model_dump(by_alias=True), status_code=201)


@router.delete("/papers/{paper_id}/chat", status_code=204)
async def clear_chat(paper_id: str):
    chat_service.clear_history(paper_id)
