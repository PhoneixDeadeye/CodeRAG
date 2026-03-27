"""SSE streaming chat endpoint."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging
import json

from app.core.database import (
    get_db,
    User,
    Repository,
    ChatSession,
    ChatMessage,
    AsyncSessionLocal,
)
from app.services.auth import get_optional_user, get_guest_session_id
from app.api.rate_limiter import check_chat_limit
from app.core.utils import generate_github_link
import app.services.rag_engine as rag_engine
from app.services.chat_service import resolve_chat_repo

router = APIRouter(prefix="/api/v1", tags=["streaming"])
logger = logging.getLogger("CodeRAG")


class StreamingChatRequest(BaseModel):
    query: str
    repo_id: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/chat/stream")
async def chat_stream(
    request: StreamingChatRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
    guest_session_id: Optional[str] = Depends(get_guest_session_id),
) -> StreamingResponse:
    """Streaming chat endpoint using Server-Sent Events (SSE)."""
    # Rate limiting
    if user:
        check_chat_limit(user.id)
    elif guest_session_id:
        check_chat_limit(f"guest:{guest_session_id}")

    # Resolve session & repo
    session: Optional[ChatSession] = None
    repo: Optional[Repository] = None

    if request.session_id:
        query_filter = [ChatSession.id == request.session_id]
        if user:
            query_filter.append(ChatSession.user_id == user.id)
        result = await db.execute(select(ChatSession).filter(*query_filter))
        session = result.scalars().first()
        if session:
            result = await db.execute(
                select(Repository).filter(Repository.id == session.repo_id)
            )
            repo = result.scalars().first()

    if not session:
        repo = await resolve_chat_repo(db, user, guest_session_id, request.repo_id)
        if not repo:

            async def error_stream():
                yield f"data: {json.dumps({'type': 'error', 'message': 'No repository available.'})}\n\n"

            return StreamingResponse(error_stream(), media_type="text/event-stream")

        session = ChatSession(
            user_id=user.id if user else None,
            repo_id=repo.id,
            name=f"Chat {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

    # Save user message
    user_msg = ChatMessage(session_id=session.id, role="user", content=request.query)
    db.add(user_msg)
    await db.commit()

    # Setup chain
    chain = rag_engine.get_cached_qa_chain(repo.vector_collection_name)
    if not chain:

        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Could not load QA chain'})}\n\n"

        return StreamingResponse(error_stream(), media_type="text/event-stream")

    # Load history
    chain.memory.clear()
    result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    recent_msgs = result.scalars().all()

    for msg in reversed(recent_msgs):
        if msg.role == "user":
            chain.memory.chat_memory.add_user_message(msg.content)
        else:
            chain.memory.chat_memory.add_ai_message(msg.content)

    # Capture IDs before generator (avoids holding db session reference)
    session_id = session.id
    repo_url = repo.url

    async def event_generator():
        """Stream tokens via SSE. Uses its own DB session to avoid lifecycle leaks."""
        full_answer = ""
        try:
            yield f"data: {json.dumps({'type': 'session_id', 'content': session_id})}\n\n"

            async for chunk in rag_engine.astream_chain_with_retry(
                chain, {"question": request.query}
            ):
                if isinstance(chunk, dict):
                    if "answer" in chunk:
                        token = chunk["answer"]
                        if token:
                            full_answer += token
                            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                    if "source_documents" in chunk:
                        sources = []
                        for doc in chunk["source_documents"]:
                            file_path = doc.metadata.get("source", "")
                            start_line = doc.metadata.get("start_line", 0)
                            end_line = doc.metadata.get("end_line", 0)
                            sources.append(
                                {
                                    "page_content": doc.page_content,
                                    "metadata": doc.metadata,
                                    "github_link": generate_github_link(
                                        repo_url, file_path, start_line, end_line
                                    ),
                                }
                            )
                        yield f"data: {json.dumps({'type': 'sources', 'content': sources})}\n\n"

            # Save AI message using a fresh session (not the request-scoped one)
            if full_answer:
                async with AsyncSessionLocal() as save_db:
                    ai_msg = ChatMessage(
                        session_id=session_id, role="assistant", content=full_answer
                    )
                    save_db.add(ai_msg)
                    result = await save_db.execute(
                        select(ChatSession).filter(ChatSession.id == session_id)
                    )
                    sess = result.scalars().first()
                    if sess:
                        sess.updated_at = datetime.now(timezone.utc)
                    await save_db.commit()

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logger.exception("Streaming chat error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
