"""Chat endpoints — regular and multi-repo queries."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime, timezone
import logging

from app.core.database import (
    get_db,
    User,
    Repository,
    ChatSession,
    ChatMessage,
    UsageLog,
)
from app.services.auth import get_optional_user, get_guest_session_id
from app.api.rate_limiter import check_chat_limit
from app.api.errors import raise_ai_service_error
from app.core.utils import generate_github_link
import app.services.rag_engine as rag_engine
from app.services.chat_service import resolve_chat_repo

router = APIRouter(prefix="/api/v1", tags=["chat"])
logger = logging.getLogger("CodeRAG")


# -- Models --
class ChatRequest(BaseModel):
    query: str
    repo_id: Optional[str] = None
    repo_ids: Optional[List[str]] = None
    session_id: Optional[str] = None

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Query cannot be empty")
        if len(v) > 5000:
            raise ValueError("Query too long (max 5000 characters)")
        return v.strip()

    def get_repo_ids(self) -> List[str]:
        if self.repo_ids:
            return self.repo_ids
        if self.repo_id:
            return [self.repo_id]
        return []


class SourceDocument(BaseModel):
    page_content: str
    metadata: dict
    github_link: Optional[str] = None
    repo_name: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    source_documents: List[SourceDocument]
    session_id: Optional[str] = None
    is_guest: bool = False
    repos_queried: Optional[List[str]] = None


# -- Helpers --
def _format_sources(docs: list, repo_url: str) -> List[SourceDocument]:
    """Convert LangChain documents to API response format."""
    sources = []
    for doc in docs:
        file_path = doc.metadata.get("source", "")
        start_line = doc.metadata.get("start_line", 0)
        end_line = doc.metadata.get("end_line", 0)
        sources.append(
            SourceDocument(
                page_content=doc.page_content,
                metadata=doc.metadata,
                github_link=generate_github_link(
                    repo_url, file_path, start_line, end_line
                ),
            )
        )
    return sources


async def query_multiple_repos(repos: List[Repository], query: str) -> dict:
    """Query multiple repositories and aggregate results."""
    all_sources = []
    repo_answers = []

    for repo in repos:
        try:
            chain = rag_engine.get_cached_qa_chain(repo.vector_collection_name)
            if not chain:
                logger.warning(f"Could not load chain for repo {repo.name}")
                continue

            response = await rag_engine.invoke_chain_with_retry(
                chain, {"question": query}
            )

            if "source_documents" in response:
                for doc in response["source_documents"]:
                    doc.metadata["repo_name"] = repo.name
                    doc.metadata["repo_id"] = repo.id
                    all_sources.append(doc)

            if response.get("answer"):
                repo_answers.append({"repo": repo.name, "answer": response["answer"]})

        except Exception as e:
            logger.error(f"Error querying repo {repo.name}: {e}")

    if len(repo_answers) > 1:
        combined = "Based on analysis across multiple repositories:\n\n"
        for ra in repo_answers:
            combined += f"**From {ra['repo']}:**\n{ra['answer']}\n\n"
        final_answer = combined.strip()
    elif repo_answers:
        final_answer = repo_answers[0]["answer"]
    else:
        final_answer = "No relevant information found in the selected repositories."

    return {
        "answer": final_answer,
        "source_documents": all_sources,
        "repos_queried": [r.name for r in repos],
    }


# -- Endpoints --
@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
    guest_session_id: Optional[str] = Depends(get_guest_session_id),
):
    """Generate a chat response using RAG engine."""
    is_guest = user is None

    # Rate limiting
    if user:
        check_chat_limit(user.organization_id or user.id)
    elif guest_session_id:
        check_chat_limit(f"guest:{guest_session_id}")
    else:
        logger.info("Anonymous chat request without guest session ID")

    # --- GUEST MODE ---
    if is_guest:
        repo = await resolve_chat_repo(db, None, guest_session_id, request.repo_id)
        if not repo:
            raise HTTPException(
                status_code=400,
                detail="No repository available. Please ingest a repository first.",
            )

        chain = rag_engine.get_cached_qa_chain(repo.vector_collection_name)
        if not chain:
            raise HTTPException(status_code=500, detail="Could not load QA chain")

        try:
            response = await rag_engine.invoke_chain_with_retry(
                chain, {"question": request.query}
            )
            return ChatResponse(
                answer=response["answer"],
                source_documents=_format_sources(
                    response.get("source_documents", []), repo.url
                ),
                session_id=None,
                is_guest=True,
            )
        except Exception as e:
            logger.exception("Error during guest chat generation")
            raise_ai_service_error(e)

    # --- AUTHENTICATED MODE ---
    session: Optional[ChatSession] = None

    if request.session_id:
        result = await db.execute(
            select(ChatSession).filter(
                ChatSession.id == request.session_id, ChatSession.user_id == user.id
            )
        )
        session = result.scalars().first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        # Find or auto-select repo
        repo_id = request.repo_id
        if not repo_id:
            active_repo = await resolve_chat_repo(db, user, None, None)
            if not active_repo:
                raise HTTPException(
                    status_code=400,
                    detail="No active repository found. Please ingest a repository first.",
                )
            repo_id = active_repo.id

        session = ChatSession(
            user_id=user.id,
            repo_id=repo_id,
            name=f"Chat {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

    result = await db.execute(
        select(Repository).filter(
            Repository.id == session.repo_id, Repository.user_id == user.id
        )
    )
    repo = result.scalars().first()
    if not repo:
        raise HTTPException(
            status_code=404, detail="Repository not found or access denied"
        )
    if repo.status != "ready":
        raise HTTPException(
            status_code=400, detail=f"Repository not ready ({repo.status})."
        )

    # Save user message + log usage
    user_msg = ChatMessage(session_id=session.id, role="user", content=request.query)
    db.add(user_msg)
    try:
        log = UsageLog(user_id=user.id, event_type="chat", details=f"Repo: {repo.name}")
        db.add(log)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.warning("Failed to save usage log")

    chain = rag_engine.get_cached_qa_chain(repo.vector_collection_name)
    if not chain:
        raise HTTPException(status_code=500, detail="Could not load QA chain")

    # Load chat history
    result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    recent_msgs = result.scalars().all()

    chain.memory.clear()
    for msg in reversed(recent_msgs):
        if msg.role == "user":
            chain.memory.chat_memory.add_user_message(msg.content)
        else:
            chain.memory.chat_memory.add_ai_message(msg.content)

    try:
        response = await rag_engine.invoke_chain_with_retry(
            chain, {"question": request.query}
        )
        ai_msg = ChatMessage(
            session_id=session.id, role="assistant", content=response["answer"]
        )
        db.add(ai_msg)
        session.updated_at = datetime.now(timezone.utc)
        await db.commit()

        return ChatResponse(
            answer=response["answer"],
            source_documents=_format_sources(
                response.get("source_documents", []), repo.url
            ),
            session_id=session.id,
            is_guest=False,
        )
    except Exception as e:
        logger.exception("Error during chat generation")
        await db.rollback()
        raise_ai_service_error(e)
