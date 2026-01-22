from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db, User, Repository, ChatSession, ChatMessage, UsageLog, Feedback
from auth import get_optional_user, get_current_user, get_guest_session_id
from pydantic import BaseModel, field_validator
from typing import Optional, List, AsyncGenerator
from datetime import datetime, timezone
import logging
import json
import asyncio
import rag_engine
from rate_limiter import check_chat_limit
from utils import generate_github_link

router = APIRouter(prefix="/api/v1", tags=["chat"])
logger = logging.getLogger("CodeRAG")

# -- Models --
class ChatRequest(BaseModel):
    query: str
    repo_id: Optional[str] = None
    session_id: Optional[str] = None
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Query cannot be empty')
        if len(v) > 5000:
            raise ValueError('Query too long (max 5000 characters)')
        return v.strip()

class SourceDocument(BaseModel):
    page_content: str
    metadata: dict
    github_link: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    source_documents: List[SourceDocument]
    session_id: Optional[str] = None  # None for guest mode
    is_guest: bool = False

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    rating: int
    comment: Optional[str] = None


# -- Endpoints --
@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user),
    guest_session_id: Optional[str] = Depends(get_guest_session_id)
):
    """
    Generate a chat response using RAG engine.
    
    Works for both authenticated users and guests:
    - Authenticated: Full session persistence, rate limiting by user
    - Guest: No persistence, rate limiting by guest session ID
    """
    is_guest = user is None
    session: Optional[ChatSession] = None
    
    # Rate limiting
    if user:
        check_chat_limit(user.id)
    elif guest_session_id:
        check_chat_limit(f"guest:{guest_session_id}")
    else:
        # Anonymous without session ID - use IP-based limiting would be ideal
        # For now, allow without limit but log
        logger.info("Anonymous chat request without guest session ID")
    
    # --- GUEST MODE ---
    if is_guest:
        # First, try to find repos belonging to this guest session
        if request.repo_id:
            repo = db.query(Repository).filter(
                Repository.id == request.repo_id,
                Repository.status == "ready"
            ).first()
        elif guest_session_id:
            # Look for repos ingested by this guest
            repo = db.query(Repository).filter(
                Repository.user_id == guest_session_id,
                Repository.status == "ready"
            ).order_by(Repository.updated_at.desc()).first()
        else:
            repo = None
        
        # If no guest repo found, fall back to any ready repo for demo purposes
        if not repo:
            repo = db.query(Repository).filter(
                Repository.status == "ready"
            ).order_by(Repository.updated_at.desc()).first()
        
        if not repo:
            raise HTTPException(
                status_code=400, 
                detail="No repository available. Please ingest a repository first using the Repositories option in the sidebar."
            )
        
        # Guest mode: No session persistence, but use cached chain for performance
        chain = rag_engine.get_cached_qa_chain(repo.vector_db_path)
        if not chain:
            raise HTTPException(status_code=500, detail="Could not load QA chain")
        
        try:
            response = await rag_engine.invoke_chain_with_retry(chain, {"question": request.query})
            answer = response["answer"]
            
            # Format sources
            sources = []
            if "source_documents" in response:
                for doc in response["source_documents"]:
                    file_path = doc.metadata.get("source", "")
                    start_line = doc.metadata.get("start_line", 0)
                    end_line = doc.metadata.get("end_line", 0)
                    sources.append(SourceDocument(
                        page_content=doc.page_content,
                        metadata=doc.metadata,
                        github_link=generate_github_link(repo.url, file_path, start_line, end_line)
                    ))
            
            return ChatResponse(
                answer=answer,
                source_documents=sources,
                session_id=None,
                is_guest=True
            )
        except Exception as e:
            logger.exception("Error during guest chat generation")
            raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(e)}")
    
    # --- AUTHENTICATED MODE ---
    # Resolve or create session
    if request.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id, 
            ChatSession.user_id == user.id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    elif request.repo_id:
        session = ChatSession(
            user_id=user.id,
            repo_id=request.repo_id,
            name=f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    else:
        # Find most recent active repo for this user
        active_repo = db.query(Repository).filter(
            Repository.user_id == user.id,
            Repository.status == "ready"
        ).order_by(Repository.updated_at.desc()).first()
        
        if not active_repo:
            raise HTTPException(
                status_code=400, 
                detail="No active repository found. Please ingest a repository first."
            )
        
        session = ChatSession(
            user_id=user.id,
            repo_id=active_repo.id,
            name=f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    
    repo = db.query(Repository).filter(Repository.id == session.repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo.status != "ready":
        raise HTTPException(
            status_code=400, 
            detail=f"Repository not ready ({repo.status}). Wait for ingestion."
        )

    # Add user message
    user_msg = ChatMessage(session_id=session.id, role="user", content=request.query)
    db.add(user_msg)
    
    # Log usage
    try:
        log = UsageLog(user_id=user.id, event_type="chat", details=f"Repo: {repo.name}")
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Failed to save usage log")

    # Generate response using cached QA chain for performance
    chain = rag_engine.get_cached_qa_chain(repo.vector_db_path)
    if not chain:
        raise HTTPException(status_code=500, detail="Could not load QA chain")
    
    # Load chat history
    recent_msgs = db.query(ChatMessage).filter(
        ChatMessage.session_id == session.id
    ).order_by(ChatMessage.created_at.desc()).limit(10).all()
    
    for msg in reversed(recent_msgs):
        if msg.role == "user":
            chain.memory.chat_memory.add_user_message(msg.content)
        else:
            chain.memory.chat_memory.add_ai_message(msg.content)

    try:
        response = await rag_engine.invoke_chain_with_retry(chain, {"question": request.query})
        answer = response["answer"]
        
        # Save AI message
        ai_msg = ChatMessage(session_id=session.id, role="assistant", content=answer)
        db.add(ai_msg)
        
        # Update session timestamp
        session.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        # Format sources
        sources = []
        if "source_documents" in response:
            for doc in response["source_documents"]:
                file_path = doc.metadata.get("source", "")
                start_line = doc.metadata.get("start_line", 0)
                end_line = doc.metadata.get("end_line", 0)
                sources.append(SourceDocument(
                    page_content=doc.page_content,
                    metadata=doc.metadata,
                    github_link=generate_github_link(repo.url, file_path, start_line, end_line)
                ))
        
        return ChatResponse(
            answer=answer,
            source_documents=sources,
            session_id=session.id,
            is_guest=False
        )

    except Exception as e:
        logger.exception("Error during chat generation")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(e)}")


@router.post("/feedback")
async def submit_feedback(
    feedback: FeedbackRequest, 
    db: Session = Depends(get_db), 
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Submit user feedback for a chat response.
    
    Works for both authenticated users and guests.
    Guest feedback is stored without user association.
    """
    new_feedback = Feedback(
        user_id=user.id if user else None,
        question=feedback.question,
        answer=feedback.answer,
        rating=feedback.rating,
        comment=feedback.comment
    )
    try:
        db.add(new_feedback)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save feedback: {str(e)}")
    return {"status": "success"}


# --- Streaming Chat Endpoint ---
class StreamingChatRequest(BaseModel):
    query: str
    repo_id: Optional[str] = None


async def generate_stream(text: str) -> AsyncGenerator[str, None]:
    """Simulate streaming by yielding words progressively."""
    words = text.split()
    for i, word in enumerate(words):
        yield f"data: {json.dumps({'type': 'token', 'content': word + ' '})}\n\n"
        await asyncio.sleep(0.02)  # Small delay for streaming effect
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/chat/stream")
async def chat_stream(
    request: StreamingChatRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
    guest_session_id: Optional[str] = Depends(get_guest_session_id)
) -> StreamingResponse:
    """
    Streaming chat endpoint using Server-Sent Events (SSE).
    
    Returns tokens progressively for a more responsive UX.
    Client should handle 'text/event-stream' content type.
    """
    # Find repo
    if request.repo_id:
        repo = db.query(Repository).filter(
            Repository.id == request.repo_id,
            Repository.status == "ready"
        ).first()
    elif user:
        repo = db.query(Repository).filter(
            Repository.user_id == user.id,
            Repository.status == "ready"
        ).order_by(Repository.updated_at.desc()).first()
    elif guest_session_id:
        repo = db.query(Repository).filter(
            Repository.user_id == guest_session_id,
            Repository.status == "ready"
        ).order_by(Repository.updated_at.desc()).first()
    else:
        repo = db.query(Repository).filter(
            Repository.status == "ready"
        ).order_by(Repository.updated_at.desc()).first()
    
    if not repo:
        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': 'No repository available'})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")
    
    # Generate response
    try:
        chain = rag_engine.get_cached_qa_chain(repo.vector_db_path)
        if not chain:
            async def error_stream():
                yield f"data: {json.dumps({'type': 'error', 'message': 'Could not load QA chain'})}\n\n"
            return StreamingResponse(error_stream(), media_type="text/event-stream")
        
        response = await rag_engine.invoke_chain_with_retry(chain, {"question": request.query})
        answer = response.get("answer", "No response generated")
        
        return StreamingResponse(
            generate_stream(answer),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )
    except Exception as e:
        logger.exception("Streaming chat error")
        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")
