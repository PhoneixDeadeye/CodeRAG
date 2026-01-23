# Export Router - Conversation Export to Markdown/PDF
# Allows users to export their chat sessions

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db, User, ChatSession, ChatMessage
from auth import get_current_user
from typing import Optional
from datetime import datetime
import logging
import io

router = APIRouter(prefix="/api/v1/export", tags=["export"])
logger = logging.getLogger("CodeRAG.Export")


def generate_markdown(session: ChatSession, messages: list) -> str:
    """Generate Markdown content for a chat session."""
    lines = [
        f"# Chat Session: {session.name or 'Untitled'}",
        "",
        f"**Created:** {session.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"**Repository:** {session.repo.name if session.repo else 'None'}",
        "",
        "---",
        "",
    ]
    
    for msg in messages:
        role_display = "👤 **User**" if msg.role == "user" else "🤖 **Assistant**"
        timestamp = msg.created_at.strftime("%H:%M:%S") if msg.created_at else ""
        
        lines.extend([
            f"### {role_display} {timestamp}",
            "",
            msg.content,
            "",
            "---",
            "",
        ])
    
    lines.extend([
        "",
        f"*Exported from CodeRAG on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}*",
    ])
    
    return "\n".join(lines)


def generate_html_for_pdf(session: ChatSession, messages: list) -> str:
    """Generate HTML content for PDF conversion."""
    html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }}
        h1 {{
            color: #2563eb;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 10px;
        }}
        .meta {{
            color: #666;
            font-size: 0.9em;
            margin-bottom: 20px;
        }}
        .message {{
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
        }}
        .user {{
            background: #f0f9ff;
            border-left: 4px solid #2563eb;
        }}
        .assistant {{
            background: #f0fdf4;
            border-left: 4px solid #22c55e;
        }}
        .role {{
            font-weight: bold;
            margin-bottom: 10px;
        }}
        .content {{
            white-space: pre-wrap;
        }}
        code {{
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
        }}
        pre {{
            background: #1e293b;
            color: #e2e8f0;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #666;
            font-size: 0.8em;
            text-align: center;
        }}
    </style>
</head>
<body>
    <h1>📝 {session.name or 'Chat Session'}</h1>
    <div class="meta">
        <p><strong>Created:</strong> {session.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
        <p><strong>Repository:</strong> {session.repo.name if session.repo else 'None'}</p>
    </div>
"""
    
    for msg in messages:
        role_class = "user" if msg.role == "user" else "assistant"
        role_icon = "👤 User" if msg.role == "user" else "🤖 Assistant"
        timestamp = msg.created_at.strftime("%H:%M:%S") if msg.created_at else ""
        
        # Escape HTML in content
        content = msg.content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # Convert code blocks
        import re
        content = re.sub(r'```(\w*)\n(.*?)```', r'<pre><code>\2</code></pre>', content, flags=re.DOTALL)
        content = re.sub(r'`([^`]+)`', r'<code>\1</code>', content)
        # Convert line breaks
        content = content.replace("\n", "<br>")
        
        html += f"""
    <div class="message {role_class}">
        <div class="role">{role_icon} <span style="color: #999; font-weight: normal;">{timestamp}</span></div>
        <div class="content">{content}</div>
    </div>
"""
    
    html += f"""
    <div class="footer">
        Exported from CodeRAG on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
    </div>
</body>
</html>
"""
    return html


@router.get("/sessions/{session_id}/markdown")
async def export_session_markdown(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Export a chat session as Markdown.
    
    Returns a downloadable .md file containing the full conversation.
    """
    # Get session
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get messages in order
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at).all()
    
    # Generate markdown
    content = generate_markdown(session, messages)
    
    # Create filename
    safe_name = "".join(c for c in (session.name or "chat") if c.isalnum() or c in " -_")[:50]
    filename = f"{safe_name}_{session.created_at.strftime('%Y%m%d')}.md"
    
    logger.info(f"📤 Exporting session {session_id} as Markdown for user {user.id}")
    
    return Response(
        content=content,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/sessions/{session_id}/html")
async def export_session_html(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Export a chat session as HTML (can be printed to PDF from browser).
    
    Returns a styled HTML file suitable for printing or saving as PDF.
    """
    # Get session
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get messages in order
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at).all()
    
    # Generate HTML
    content = generate_html_for_pdf(session, messages)
    
    # Create filename
    safe_name = "".join(c for c in (session.name or "chat") if c.isalnum() or c in " -_")[:50]
    filename = f"{safe_name}_{session.created_at.strftime('%Y%m%d')}.html"
    
    logger.info(f"📤 Exporting session {session_id} as HTML for user {user.id}")
    
    return Response(
        content=content,
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/sessions/{session_id}/json")
async def export_session_json(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Export a chat session as JSON.
    
    Returns a structured JSON file with all conversation data.
    """
    import json
    
    # Get session
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get messages in order
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at).all()
    
    # Build JSON structure
    data = {
        "session": {
            "id": session.id,
            "name": session.name,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat() if session.updated_at else None,
            "repository": {
                "id": session.repo.id,
                "name": session.repo.name,
                "url": session.repo.url
            } if session.repo else None
        },
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None
            }
            for msg in messages
        ],
        "exported_at": datetime.utcnow().isoformat(),
        "export_version": "1.0"
    }
    
    content = json.dumps(data, indent=2, ensure_ascii=False)
    
    # Create filename
    safe_name = "".join(c for c in (session.name or "chat") if c.isalnum() or c in " -_")[:50]
    filename = f"{safe_name}_{session.created_at.strftime('%Y%m%d')}.json"
    
    logger.info(f"📤 Exporting session {session_id} as JSON for user {user.id}")
    
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
