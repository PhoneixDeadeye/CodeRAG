# CodeRAG API Documentation

Complete API reference for the CodeRAG backend service.

**Base URL:** `http://localhost:8000`  
**API Version:** v1  
**API Prefix:** `/api/v1`

## 📋 Table of Contents

- [Authentication](#authentication)
- [Repositories](#repositories)
- [Chat](#chat)
- [Files](#files)
- [Sessions](#sessions)
- [Export](#export)
- [Diff Analysis](#diff-analysis)
- [Jobs](#jobs)
- [WebSocket](#websocket)

---

## 🔐 Authentication

### Register User

**POST** `/api/v1/auth/register`

Create a new user account.

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

### Login

**POST** `/api/v1/auth/login`

Authenticate and receive JWT token.

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Get Current User

**GET** `/api/v1/auth/me`

Get authenticated user details.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "is_active": true,
  "created_at": "2024-01-20T10:30:00Z"
}
```

---

## 📦 Repositories

### List Repositories

**GET** `/api/v1/repos`

List all repositories for the authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "repos": [
    {
      "id": "uuid",
      "name": "langchain",
      "url": "https://github.com/langchain-ai/langchain",
      "status": "ready",
      "created_at": "2024-01-20T10:30:00Z",
      "updated_at": "2024-01-20T11:00:00Z"
    }
  ]
}
```

**Status values:**
- `pending` - Queued for ingestion
- `cloning` - Cloning repository
- `indexing` - Creating embeddings
- `ready` - Available for queries
- `failed` - Ingestion failed

### Ingest Repository

**POST** `/api/v1/repos/ingest`

Clone and index a GitHub repository.

**Headers:** `Authorization: Bearer <token>`

```json
{
  "repo_url": "https://github.com/langchain-ai/langchain",
  "repo_name": "LangChain",
  "force_reindex": false
}
```

**Response:** `202 Accepted`
```json
{
  "message": "Repository ingestion started",
  "repo_id": "uuid",
  "job_id": "job-uuid",
  "status": "cloning"
}
```

### Get Repository Details

**GET** `/api/v1/repos/{repo_id}`

Get detailed information about a specific repository.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "langchain",
  "url": "https://github.com/langchain-ai/langchain",
  "status": "ready",
  "stats": {
    "chunk_count": 1523,
    "file_count": 342
  },
  "created_at": "2024-01-20T10:30:00Z",
  "updated_at": "2024-01-20T11:00:00Z"
}
```

### Delete Repository

**DELETE** `/api/v1/repos/{repo_id}`

Delete a repository and all associated data.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "message": "Repository deleted successfully"
}
```

---

## 💬 Chat

### Send Chat Message

**POST** `/api/v1/chat`

Send a question and get an AI-powered answer.

**Headers:** `Authorization: Bearer <token>` (optional for guest access)

```json
{
  "query": "How does authentication work in this codebase?",
  "repo_id": "uuid",
  "session_id": "session-uuid"
}
```

**Response:** `200 OK`
```json
{
  "answer": "Authentication is implemented using JWT tokens...",
  "source_documents": [
    {
      "page_content": "# Auth implementation code...",
      "metadata": {
        "source": "app/services/auth.py",
        "language": "python",
        "start_line": 10,
        "end_line": 30
      },
      "github_link": "https://github.com/..."
    }
  ],
  "session_id": "session-uuid",
  "is_guest": false
}
```

### Streaming Chat

**POST** `/api/v1/chat/stream`

Stream chat responses using Server-Sent Events (SSE).

**Headers:** `Authorization: Bearer <token>` (optional)

```json
{
  "query": "Explain the database schema",
  "repo_id": "uuid"
}
```

**Response:** `text/event-stream`
```
data: {"type":"token","content":"The database "}
data: {"type":"token","content":"schema consists "}
data: {"type":"token","content":"of... "}
data: {"type":"done"}
```

### Upload File for Context

**POST** `/api/v1/chat/upload`

Upload a file to include in chat context.

**Headers:** `Authorization: Bearer <token>` (optional)

**Form Data:**
- `file`: File to upload (max 2MB)

**Supported formats:** `.py`, `.js`, `.ts`, `.java`, `.md`, `.txt`, etc.

**Response:** `200 OK`
```json
{
  "filename": "config.py",
  "content": "# Configuration file content...",
  "file_type": ".py"
}
```

### Submit Feedback

**POST** `/api/v1/feedback`

Submit feedback for a chat response.

**Headers:** `Authorization: Bearer <token>` (optional)

```json
{
  "question": "How does auth work?",
  "answer": "Authentication uses JWT...",
  "rating": 5,
  "comment": "Very helpful explanation!"
}
```

**Response:** `200 OK`
```json
{
  "status": "success"
}
```

---

## 📁 Files

### Get File Content

**GET** `/api/v1/files/content`

Retrieve file content from a repository.

**Query Parameters:**
- `file_path`: Path to the file
- `repo_id`: Repository ID (optional)

**Response:** `200 OK`
```json
{
  "content": "# File content here...",
  "language": "python",
  "file_path": "app/main.py"
}
```

### List Files

**GET** `/api/v1/files/tree`

Get repository file tree structure.

**Query Parameters:**
- `repo_id`: Repository ID

**Response:** `200 OK`
```json
{
  "tree": [
    {
      "name": "app",
      "path": "app",
      "type": "directory",
      "children": [
        {
          "name": "main.py",
          "path": "app/main.py",
          "type": "file"
        }
      ]
    }
  ]
}
```

### Search Code

**POST** `/api/v1/files/search`

Search for code patterns across repository.

```json
{
  "query": "def authenticate",
  "is_regex": false,
  "case_sensitive": false,
  "repo_id": "uuid"
}
```

**Response:** `200 OK`
```json
{
  "results": [
    {
      "file_path": "app/services/auth.py",
      "line_number": 45,
      "line_content": "def authenticate(email: str, password: str):",
      "match_start": 4,
      "match_end": 16
    }
  ]
}
```

### Get Symbol Index

**GET** `/api/v1/files/symbols`

Get index of all functions, classes, and symbols in repository.

**Query Parameters:**
- `repo_id`: Repository ID

**Response:** `200 OK`
```json
{
  "symbols": [
    {
      "name": "authenticate",
      "type": "function",
      "file": "app/services/auth.py",
      "line": 45,
      "language": "python"
    },
    {
      "name": "User",
      "type": "class",
      "file": "app/models/user.py",
      "line": 10,
      "language": "python"
    }
  ]
}
```

---

## 💾 Sessions

### List Chat Sessions

**GET** `/api/v1/sessions`

List all chat sessions for the current user.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "sessions": [
    {
      "id": "uuid",
      "name": "LangChain Discussion",
      "repo_url": "https://github.com/langchain-ai/langchain",
      "created_at": "2024-01-20T10:30:00Z",
      "updated_at": "2024-01-20T11:00:00Z"
    }
  ]
}
```

### Create Session

**POST** `/api/v1/sessions`

Create a new chat session.

**Headers:** `Authorization: Bearer <token>`

```json
{
  "name": "Architecture Review",
  "repo_url": "https://github.com/langchain-ai/langchain"
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid"
}
```

### Get Session Messages

**GET** `/api/v1/sessions/{session_id}/messages`

Retrieve all messages in a session.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "How does the router work?",
      "created_at": "2024-01-20T10:30:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "The router is implemented...",
      "created_at": "2024-01-20T10:30:15Z"
    }
  ]
}
```

### Delete Session

**DELETE** `/api/v1/sessions/{session_id}`

Delete a chat session and all its messages.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "message": "Session deleted"
}
```

---

## 📤 Export

### Export Session as Markdown

**GET** `/api/v1/export/session/{session_id}/markdown`

Export chat session as Markdown file.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```markdown
# Chat Session: Architecture Review

**Created:** 2024-01-20 10:30:00 UTC
**Repository:** langchain

---

### 👤 User 10:30:15
How does the router work?

---

### 🤖 Assistant 10:30:30
The router is implemented using FastAPI...
```

### Export Session as HTML

**GET** `/api/v1/export/session/{session_id}/html`

Export chat session as styled HTML.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK` (HTML content)

### Export Session as JSON

**GET** `/api/v1/export/session/{session_id}/json`

Export chat session as structured JSON.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "session": {
    "id": "uuid",
    "name": "Architecture Review",
    "created_at": "2024-01-20T10:30:00Z"
  },
  "messages": [...]
}
```

---

## 🔀 Diff Analysis

### Analyze Code Diff

**POST** `/api/v1/diff/analyze`

Analyze differences between two code versions with AI explanation.

```json
{
  "file_path": "app/main.py",
  "old_content": "def old_function():\n    pass",
  "new_content": "async def new_function():\n    await some_async_call()",
  "repo_id": "uuid"
}
```

**Response:** `200 OK`
```json
{
  "file_path": "app/main.py",
  "hunks": [
    {
      "old_start": 1,
      "old_count": 2,
      "new_start": 1,
      "new_count": 2,
      "lines": [
        {
          "line_number": 1,
          "type": "remove",
          "content": "def old_function():"
        },
        {
          "line_number": 1,
          "type": "add",
          "content": "async def new_function():"
        }
      ]
    }
  ],
  "summary": "**app/main.py**: +2 lines, -2 lines in 1 hunk(s)",
  "additions": 2,
  "deletions": 2,
  "ai_explanation": "The function was converted to async/await pattern..."
}
```

### Compare Commits

**POST** `/api/v1/diff/compare-commits`

Compare two git commits.

**Query Parameters:**
- `repo_id`: Repository ID
- `commit1`: First commit hash
- `commit2`: Second commit hash

**Response:** `200 OK`
```json
{
  "repo_id": "uuid",
  "commit1": "abc123",
  "commit2": "def456",
  "stat": " 3 files changed, 42 insertions(+), 18 deletions(-)",
  "diff": "diff --git a/file.py b/file.py..."
}
```

### Get File History

**GET** `/api/v1/diff/file-history/{repo_id}`

Get commit history for a specific file.

**Query Parameters:**
- `file_path`: Path to the file
- `limit`: Number of commits (default: 10)

**Response:** `200 OK`
```json
{
  "file_path": "app/main.py",
  "repo_id": "uuid",
  "commits": [
    {
      "hash": "abc123",
      "message": "Add async support",
      "author": "John Doe",
      "date": "2024-01-20T10:30:00Z"
    }
  ]
}
```

---

## ⚙️ Jobs

### Get Job Status

**GET** `/api/v1/jobs/{job_id}`

Check status of a background job.

**Response:** `200 OK`
```json
{
  "id": "job-uuid",
  "func_name": "ingest_repository",
  "status": "completed",
  "error": null,
  "created_at": "2024-01-20T10:30:00Z",
  "started_at": "2024-01-20T10:30:05Z",
  "completed_at": "2024-01-20T10:35:00Z"
}
```

### List Jobs

**GET** `/api/v1/jobs`

List all background jobs.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status`: Filter by status (pending/running/completed/failed)
- `limit`: Max results (default: 50)

**Response:** `200 OK`
```json
{
  "jobs": [...],
  "total": 10,
  "pending": 2,
  "running": 1,
  "completed": 5,
  "failed": 2
}
```

---

## 🔌 WebSocket

### Real-time Chat

**WS** `/api/v1/ws/{session_id}`

WebSocket endpoint for real-time bidirectional chat.

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/ws/session-uuid');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};

ws.send(JSON.stringify({
  type: 'query',
  content: 'How does the database work?'
}));
```

**Message Types:**
- `query` - Send question
- `answer` - Receive answer
- `sources` - Receive source documents
- `error` - Error occurred
- `ping/pong` - Keep-alive

---

## 🔧 Utility Endpoints

### Health Check

**GET** `/health`

Check API health status.

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "version": "3.0",
  "service": "CodeRAG SaaS API"
}
```

### Metrics

**GET** `/metrics`

Prometheus metrics for monitoring.

**Response:** `text/plain`
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",endpoint="/health"} 1523

# HELP llm_invocation_duration_seconds LLM response time
# TYPE llm_invocation_duration_seconds histogram
llm_invocation_duration_seconds_bucket{le="1.0"} 45
...
```

---

## 🚨 Error Responses

All error responses follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**

- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

---

## 📊 Rate Limits

**Default Limits:**
- Chat: 50 requests/minute per user
- Ingestion: 5 requests/hour per user
- File operations: 100 requests/minute per user

**Headers:**
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

---

## 🔒 Authentication

Most endpoints require JWT authentication. Include the token in the `Authorization` header:

```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

Guest endpoints (no authentication required):
- `POST /api/v1/chat` (limited functionality)
- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`

---

## 📝 Best Practices

1. **Always check job status** after starting repository ingestion
2. **Use streaming** for long responses to improve UX
3. **Implement exponential backoff** for retries on 429 errors
4. **Cache responses** when appropriate (file content, etc.)
5. **Close WebSocket connections** when not in use
6. **Validate inputs** on the client side before sending requests

---

## 🔗 Additional Resources

- **Interactive API Docs:** http://localhost:8000/docs
- **OpenAPI Schema:** http://localhost:8000/openapi.json
- **GitHub Repository:** https://github.com/yourusername/coderag
