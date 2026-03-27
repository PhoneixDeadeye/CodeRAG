# Diff Analysis Router - AI-Powered Code Diff Explanation
# Provides intelligent analysis of code changes

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, User, Repository
from app.services.auth import get_optional_user
from pydantic import BaseModel
from typing import Optional, List
import os
import difflib
import re
import logging

router = APIRouter(prefix="/api/v1/diff", tags=["diff"])
logger = logging.getLogger("CodeRAG.Diff")


class DiffAnalysisRequest(BaseModel):
    """Request for AI-powered diff analysis."""

    old_content: str
    new_content: str
    file_path: str
    repo_id: Optional[str] = None
    skip_ai_explanation: bool = False  # Skip AI for faster responses


class DiffLine(BaseModel):
    """A single line in a diff."""

    line_number: int
    type: str  # 'add', 'remove', 'context'
    content: str


class DiffHunk(BaseModel):
    """A contiguous block of changes."""

    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: List[DiffLine]


class DiffAnalysisResponse(BaseModel):
    """Response with diff analysis."""

    file_path: str
    hunks: List[DiffHunk]
    summary: str
    additions: int
    deletions: int
    ai_explanation: Optional[str] = None


def compute_diff(old_content: str, new_content: str) -> List[DiffHunk]:
    """Compute unified diff between two content strings."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)

    differ = difflib.unified_diff(
        old_lines,
        new_lines,
        lineterm="",
        n=3,  # Context lines
    )

    hunks = []
    current_hunk = None

    for line in differ:
        if line.startswith("@@"):
            # Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            if current_hunk:
                hunks.append(current_hunk)

            match = re.match(r"@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@", line)
            if match:
                current_hunk = DiffHunk(
                    old_start=int(match.group(1)),
                    old_count=int(match.group(2) or 1),
                    new_start=int(match.group(3)),
                    new_count=int(match.group(4) or 1),
                    lines=[],
                )
        elif current_hunk is not None:
            if line.startswith("+") and not line.startswith("+++"):
                current_hunk.lines.append(
                    DiffLine(
                        line_number=0,  # Will be computed
                        type="add",
                        content=line[1:].rstrip("\n"),
                    )
                )
            elif line.startswith("-") and not line.startswith("---"):
                current_hunk.lines.append(
                    DiffLine(
                        line_number=0, type="remove", content=line[1:].rstrip("\n")
                    )
                )
            elif line.startswith(" "):
                current_hunk.lines.append(
                    DiffLine(
                        line_number=0, type="context", content=line[1:].rstrip("\n")
                    )
                )

    if current_hunk:
        hunks.append(current_hunk)

    return hunks


def generate_diff_summary(hunks: List[DiffHunk], file_path: str) -> str:
    """Generate a human-readable summary of the diff."""
    additions = sum(1 for h in hunks for line in h.lines if line.type == "add")
    deletions = sum(1 for h in hunks for line in h.lines if line.type == "remove")

    if not hunks:
        return "No changes detected."

    parts = []
    parts.append(f"**{file_path}**: ")

    if additions and deletions:
        parts.append(f"+{additions} lines, -{deletions} lines")
    elif additions:
        parts.append(f"+{additions} lines added")
    elif deletions:
        parts.append(f"-{deletions} lines removed")

    parts.append(f" in {len(hunks)} hunk(s)")

    return "".join(parts)


async def generate_ai_explanation(
    old_content: str, new_content: str, file_path: str
) -> Optional[str]:
    """
    Use the LLM to generate an explanation of the code changes.
    """
    try:
        import app.services.rag_engine as rag_engine
        import asyncio

        llm = rag_engine.get_llm()
        if not llm:
            logger.debug("LLM not available for diff explanation")
            return None

        # Detect file extension for context
        ext = os.path.splitext(file_path)[1].lower()
        lang_map = {
            ".py": "Python",
            ".js": "JavaScript",
            ".ts": "TypeScript",
            ".java": "Java",
            ".go": "Go",
            ".rs": "Rust",
            ".cpp": "C++",
            ".c": "C",
            ".rb": "Ruby",
            ".php": "PHP",
        }
        language = lang_map.get(ext, "code")

        # Prepare a prompt for the LLM
        prompt = f"""Analyze these {language} code changes in {file_path}:

OLD VERSION:
```{language.lower()}
{old_content[:2000]}
```

NEW VERSION:
```{language.lower()}
{new_content[:2000]}
```

Provide a concise explanation:
1. What changed
2. Why this change might have been made
3. Any potential impacts or concerns

Response (under 200 words):"""

        # Run with timeout of 15 seconds
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(llm.invoke, prompt), timeout=15.0
            )
            if response:
                return str(response).strip()
        except asyncio.TimeoutError:
            logger.warning("AI explanation timed out after 15s")
            return None

    except Exception as e:
        logger.warning(f"Failed to generate AI explanation: {e}")
        return None


@router.post("/analyze", response_model=DiffAnalysisResponse)
async def analyze_diff(
    request: DiffAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """
    Analyze code differences with AI-powered explanation.

    Provides:
    - Unified diff with hunks
    - Line-by-line changes
    - AI-generated explanation of changes
    """
    # Compute structured diff
    hunks = compute_diff(request.old_content, request.new_content)

    # Count changes
    additions = sum(1 for h in hunks for line in h.lines if line.type == "add")
    deletions = sum(1 for h in hunks for line in h.lines if line.type == "remove")

    # Generate summary
    summary = generate_diff_summary(hunks, request.file_path)

    # Generate AI explanation (optional, can be slow)
    ai_explanation = None
    if (
        not request.skip_ai_explanation
        and len(request.old_content) < 5000
        and len(request.new_content) < 5000
    ):
        ai_explanation = await generate_ai_explanation(
            request.old_content, request.new_content, request.file_path
        )

    return DiffAnalysisResponse(
        file_path=request.file_path,
        hunks=hunks,
        summary=summary,
        additions=additions,
        deletions=deletions,
        ai_explanation=ai_explanation,
    )


@router.post("/compare-commits")
async def compare_commits(
    repo_id: str,
    commit1: str,
    commit2: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """
    Compare two commits and return the diff.

    Uses git to get the actual diff between commits.
    """
    result = await db.execute(select(Repository).filter(Repository.id == repo_id))
    repo = result.scalars().first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not os.path.exists(repo.local_path):
        raise HTTPException(status_code=404, detail="Repository files not found")

    try:
        import git

        git_repo = git.Repo(repo.local_path)

        # Get diff between commits
        diff = git_repo.git.diff(commit1, commit2, stat=True)
        detailed_diff = git_repo.git.diff(commit1, commit2)

        return {
            "repo_id": repo_id,
            "commit1": commit1,
            "commit2": commit2,
            "stat": diff,
            "diff": detailed_diff[:10000],  # Limit size
        }
    except Exception as e:
        logger.error(f"Git diff error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute diff. Please try again.")


@router.get("/file-history/{repo_id}")
async def get_file_history(
    repo_id: str,
    file_path: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """
    Get the commit history for a specific file.
    """
    result = await db.execute(select(Repository).filter(Repository.id == repo_id))
    repo = result.scalars().first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not os.path.exists(repo.local_path):
        raise HTTPException(status_code=404, detail="Repository files not found")

    try:
        import git

        git_repo = git.Repo(repo.local_path)

        commits = []
        for commit in git_repo.iter_commits(paths=file_path, max_count=limit):
            commits.append(
                {
                    "hash": commit.hexsha[:8],
                    "message": commit.message.strip()[:100],
                    "author": commit.author.name,
                    "date": commit.committed_datetime.isoformat(),
                }
            )

        return {
            "file_path": file_path,
            "repo_id": repo_id,
            "commits": commits,
        }
    except Exception as e:
        logger.error(f"Git history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get file history. Please try again.")
