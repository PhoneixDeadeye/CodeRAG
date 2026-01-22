"""
WebSocket Router for Real-time Updates

Provides WebSocket connections for:
- Repository ingestion progress
- Live notifications
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import logging
import asyncio

router = APIRouter(prefix="/api/v1/ws", tags=["websocket"])
logger = logging.getLogger("CodeRAG")

# --- Connection Manager ---
class ConnectionManager:
    """Manages WebSocket connections for broadcasting updates."""
    
    def __init__(self):
        # Map of repo_id -> set of connected WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, repo_id: str):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        if repo_id not in self.active_connections:
            self.active_connections[repo_id] = set()
        self.active_connections[repo_id].add(websocket)
        logger.info(f"WebSocket connected for repo {repo_id}")
    
    def disconnect(self, websocket: WebSocket, repo_id: str):
        """Remove a WebSocket connection."""
        if repo_id in self.active_connections:
            self.active_connections[repo_id].discard(websocket)
            if not self.active_connections[repo_id]:
                del self.active_connections[repo_id]
        logger.info(f"WebSocket disconnected for repo {repo_id}")
    
    async def broadcast(self, repo_id: str, message: dict):
        """Broadcast a message to all connections for a repo."""
        if repo_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[repo_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.add(connection)
            # Clean up dead connections
            for conn in dead_connections:
                self.active_connections[repo_id].discard(conn)


# Global connection manager instance
manager = ConnectionManager()


# --- WebSocket Endpoints ---
@router.websocket("/ingest/{repo_id}")
async def websocket_ingestion_progress(websocket: WebSocket, repo_id: str):
    """
    WebSocket endpoint for repo ingestion progress updates.
    
    Clients connect to receive real-time updates during repo ingestion:
    - {"type": "progress", "stage": "cloning", "progress": 25}
    - {"type": "progress", "stage": "parsing", "progress": 50}
    - {"type": "progress", "stage": "embedding", "progress": 75}
    - {"type": "complete", "status": "ready"}
    - {"type": "error", "message": "..."}
    """
    await manager.connect(websocket, repo_id)
    try:
        while True:
            # Keep connection alive, wait for client messages
            data = await websocket.receive_text()
            # Handle ping/pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, repo_id)


# --- Helper Functions for Broadcasting ---
async def broadcast_ingestion_progress(repo_id: str, stage: str, progress: int):
    """Broadcast ingestion progress update."""
    await manager.broadcast(repo_id, {
        "type": "progress",
        "stage": stage,
        "progress": progress
    })


async def broadcast_ingestion_complete(repo_id: str, status: str):
    """Broadcast ingestion completion."""
    await manager.broadcast(repo_id, {
        "type": "complete",
        "status": status
    })


async def broadcast_ingestion_error(repo_id: str, message: str):
    """Broadcast ingestion error."""
    await manager.broadcast(repo_id, {
        "type": "error",
        "message": message
    })
