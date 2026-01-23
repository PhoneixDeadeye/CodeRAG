# Diff Analysis Router - AI-Powered Code Diff Explanation
# Provides intelligent analysis of code changes

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db, User, Repository
from auth import get_optional_user
from pydantic import BaseModel
from typing import Optional, List
import os
import difflib
import logging

router = APIRouter(prefix="/api/v1/diff", tags=["diff"])
logger = logging.getLogger("CodeRAG.Diff")


class DiffAnalysisRequest(BaseModel):
    """Request for AI-powered diff analysis."""
    old_content: str
    new_content: str
    file_path: str
    repo_id: Optional[str] = None


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
        old_lines, new_lines,
        lineterm='',
        n=3  # Context lines
    )
    
    hunks = []
    current_hunk = None
    
    for line in differ:
        if line.startswith('@@'):
            # Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            if current_hunk:
                hunks.append(current_hunk)
            
            import re
            match = re.match(r'@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@', line)
            if match:
                current_hunk = DiffHunk(
                    old_start=int(match.group(1)),
                    old_count=int(match.group(2) or 1),
                    new_start=int(match.group(3)),
                    new_count=int(match.group(4) or 1),
                    lines=[]
                )
        elif current_hunk is not None:
            if line.startswith('+') and not line.startswith('+++'):
                current_hunk.lines.append(DiffLine(
                    line_number=0,  # Will be computed
                    type='add',
                    content=line[1:].rstrip('\n')
                ))
            elif line.startswith('-') and not line.startswith('---'):
                current_hunk.lines.append(DiffLine(
                    line_number=0,
                    type='remove',
                    content=line[1:].rstrip('\n')
                ))
            elif line.startswith(' '):
                current_hunk.lines.append(DiffLine(
                    line_number=0,
                    type='context',
                    content=line[1:].rstrip('\n')
                ))
    
    if current_hunk:
        hunks.append(current_hunk)
    
    return hunks


def generate_diff_summary(hunks: List[DiffHunk], file_path: str) -> str:
    """Generate a human-readable summary of the diff."""
    additions = sum(1 for h in hunks for l in h.lines if l.type == 'add')
    deletions = sum(1 for h in hunks for l in h.lines if l.type == 'remove')
    
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
    old_content: str,
    new_content: str,
    file_path: str
) -> Optional[str]:
    """
    Use the LLM to generate an explanation of the code changes.
    """
    async def _invoke_llm():
        try:
            llm = rag_engine.get_llm()
            if llm:
                # Run blocking invoke in thread
                return await asyncio.to_thread(llm.invoke, prompt)
        except Exception as e:
            logger.warning(f"LLM invocation failed: {e}")
            return None
            
    try:
        import rag_engine
        import asyncio
        
        # Prepare a prompt for the LLM
        prompt = f"""Analyze the following code changes in {file_path} and provide a concise explanation:

OLD VERSION:
```
{old_content[:2000]}
```

NEW VERSION:
```
{new_content[:2000]}
```

Provide a brief summary of:
1. What changed
2. Why this change might have been made
3. Any potential impacts or concerns

Keep your response under 200 words."""

        # Run with timeout of 10 seconds
        try:
            response = await asyncio.wait_for(_invoke_llm(), timeout=10.0)
            if response:
                return str(response)
        except asyncio.TimeoutError:
            logger.warning("AI explanation timed out")
            return None
            
    except Exception as e:
        logger.warning(f"Failed to generate AI explanation: {e}")
    
    return None



@router.post("/analyze", response_model=DiffAnalysisResponse)
async def analyze_diff(
    request: DiffAnalysisRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user)
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
    additions = sum(1 for h in hunks for l in h.lines if l.type == 'add')
    deletions = sum(1 for h in hunks for l in h.lines if l.type == 'remove')
    
    # Generate summary
    summary = generate_diff_summary(hunks, request.file_path)
    
    # Generate AI explanation (optional, can be slow)
    ai_explanation = None
    if len(request.old_content) < 5000 and len(request.new_content) < 5000:
        ai_explanation = await generate_ai_explanation(
            request.old_content,
            request.new_content,
            request.file_path
        )
    
    return DiffAnalysisResponse(
        file_path=request.file_path,
        hunks=hunks,
        summary=summary,
        additions=additions,
        deletions=deletions,
        ai_explanation=ai_explanation
    )


@router.post("/compare-commits")
async def compare_commits(
    repo_id: str,
    commit1: str,
    commit2: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Compare two commits and return the diff.
    
    Uses git to get the actual diff between commits.
    """
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
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
        raise HTTPException(status_code=500, detail=f"Failed to compute diff: {str(e)}")


@router.get("/file-history/{repo_id}")
async def get_file_history(
    repo_id: str,
    file_path: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Get the commit history for a specific file.
    """
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    if not os.path.exists(repo.local_path):
        raise HTTPException(status_code=404, detail="Repository files not found")
    
    try:
        import git
        
        git_repo = git.Repo(repo.local_path)
        
        commits = []
        for commit in git_repo.iter_commits(paths=file_path, max_count=limit):
            commits.append({
                "hash": commit.hexsha[:8],
                "message": commit.message.strip()[:100],
                "author": commit.author.name,
                "date": commit.committed_datetime.isoformat(),
            })
        
        return {
            "file_path": file_path,
            "repo_id": repo_id,
            "commits": commits,
        }
    except Exception as e:
        logger.error(f"Git history error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")
