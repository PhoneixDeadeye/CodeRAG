# 🤖 CodeRAG: The Intelligent Repository Assistant

> **Chat with your codebase.** CodeRAG is a semantic search engine that ingests your Git repositories, understands your code structure, and answers complex engineering questions using Google's Gemini 1.5 Flash.

![CodeRAG Demo Placeholder](https://via.placeholder.com/800x400?text=CodeRAG+Dashboard+Preview)

## 🚀 Key Features

-   **🧠 Semantic Understanding**: Uses **Google Gemini Embeddings** to understand the *intent* of your code.
-   **⚡ 1M+ Token Context**: Powered by **Gemini 2.0 Flash Lite**, capable of analyzing massive files and dependency chains.
-   **🔄 Code Diff Analysis**: AI-powered explanation of code changes between git revisions.
-   **📊 RAG Evaluation**: Built-in pipeline to measure faithfulness and relevance of answers.
-   **📈 Observability**: Prometheus metrics for monitoring LLM latency and ingestion jobs.
-   **🕸️ Smart Ingestion**:
    -   Ignores noise (`node_modules`, `lockfiles`).
    -   Respects language syntax (Python, JS, TS, Go, Rust) via Tree-sitter.
    -   Background job processing for large repositories.
-   **💻 Modern Stack**: FastAPI (Async), React + Tailwind, Playwright E2E Tests.

---

## 🏗️ Architecture

```mermaid
graph LR
    User[User] -->|Repo/Diff| Frontend[React Frontend]
    User -->|Question| Frontend
    Frontend -->|API Config| API[FastAPI Backend]
    
    subgraph Background Workers
        API -->|Enqueue Job| Worker[Celery Worker]
        Worker -->|Clone & Chunk| Ingest[Ingestion Engine]
        Ingest -->|Embed| Gemini[Google Gemini API]
        Gemini -->|Vectors| Qdrant[Qdrant Vector DB]
    end
    
    subgraph RAG Loop
        API -->|Query| Retriever[Hybrid Retriever (BM25 + Vector)]
        Retriever -->|Re-rank| CrossEncoder[Cross-Encoder]
        CrossEncoder -->|Context| LLM[Gemini 2.0 Flash Lite]
        LLM -->|Answer + Sources| API
    end
```

## 🛠️ Tech Stack

-   **Frontend**: React (Vite), TypeScript, Tailwind CSS, Lucide Icons.
-   **Backend**: Python, FastAPI, Uvicorn, SQLAlchemy (Async).
-   **AI/ML**: LangChain, Google Generative AI (Gemini 2.0), Qdrant, Sentence Transformers.
-   **Tools**: GitPython, Tree-sitter, Playwright (E2E), Prometheus.


---

## ⚡ Quick Start

### Prerequisites
-   Node.js (v18+)
-   Python (v3.10+)
-   A [Google AI Studio API Key](https://aistudio.google.com/app/apikey)

### 1. Configuration
The `.env` file should already exist in the root directory. If not, copy from `.env.example`:
```bash
cp .env.example .env
```

Edit `.env` and ensure your Google API Key is set:
```bash
# Required
GOOGLE_API_KEY=your_google_api_key_here

# Optional (defaults shown)
SECRET_KEY=supersecretkey_change_me_in_prod
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
CHAT_RATE_LIMIT=50
INGEST_RATE_LIMIT=5
```

### 2. Backend Setup
Install Python dependencies and start the server:
```bash
# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000
```
*Server will start at `http://localhost:8000`*
*API documentation available at `http://localhost:8000/docs`*

### 3. Frontend Setup
Open a new terminal, navigate to the frontend folder, and start the UI:
```bash
cd frontend

# Install Node modules
npm install

# Start the dev server
npm run dev
```
*Frontend will start at `http://localhost:5173`*

### 4. First Run
1. Open your browser and navigate to `http://localhost:5173`
2. Create an account (register) or use guest mode
3. Ingest your first repository using the sidebar
4. Start chatting with your codebase!

---

## 🐳 Docker Deployment

For production deployment using Docker:

```bash
# Using Docker Compose (recommended)
docker-compose up -d

# Or build and run manually
docker build -t coderag .
docker run -p 8000:8000 --env-file .env coderag
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete production deployment guide.

---

## 🧪 Testing

### Backend Tests
Run the backend test suite with pytest:
```bash
# From the project root
pytest -v
```

### E2E Tests (Playwright)
Run the full comprehensive test suite:
```bash
# Install browsers first
npx playwright install

# Run all E2E tests
npm test
```

### Test Coverage
- **E2E**: Covers Auth, Multi-Repo Chat, Ingestion, and Diff Analysis workflows.
- **Backend Unit**: API endpoints, RAG Engine, Job Worker.


---

## 📖 Usage Guide

1.  **Ingest a Repository**:
    -   Open the sidebar.
    -   Paste a public GitHub URL (e.g., `https://github.com/langchain-ai/langchain`).
    -   Click **Ingest Repository**. This clones the repo and builds the vector index locally.
    
2.  **Ask Questions**:
    -   "How is authentication handled in `auth.py`?"
    -   "Explain the dependency injection pattern used here."
    -   "Where is the main entry point?"

3.  **Inspect Sources**:
    -   Click **View Source Documents** below any AI response to see the raw code chunks retrieved by the engine.

4.  **Analyze Diffs**:
    -   Navigate to the **Files Explorer**.
    -   Select a file and click "View History".
    -   Select code changes to see an AI-generated explanation of the diff.

5.  **Export Chat**:
    -   Click the "Export" button in the chat header to download the session as Markdown, HTML, or JSON.


---

## 📂 Project Structure

```
CodeRAG/
├── app/                       # Backend Application Package
│   ├── api/                   # API Layer
│   │   ├── main.py            # FastAPI Application entry point
│   │   ├── routers/           # API route handlers
│   │   │   ├── auth.py        # Authentication endpoints
│   │   │   ├── repos.py       # Repository management
│   │   │   ├── chat.py        # Chat/RAG endpoints
│   │   │   ├── files.py       # File browsing
│   │   │   └── ...            # Other routers
│   │   ├── middleware.py      # Request tracing, security headers
│   │   └── rate_limiter.py    # Rate limiting logic
│   │
│   ├── core/                  # Core Infrastructure
│   │   ├── config.py          # Application settings
│   │   ├── database.py        # SQLAlchemy models & session
│   │   ├── errors.py          # Custom exception handlers
│   │   ├── logging_config.py  # Centralized logging
│   │   └── utils.py           # Path validation, helpers
│   │
│   └── services/              # Business Logic
│       ├── auth.py            # JWT authentication
│       ├── ingest.py          # Git cloning & code chunking
│       ├── rag_engine.py      # Vector DB & LLM Chain
│       ├── worker.py          # Background job processing
│       └── metrics.py         # Prometheus observability
│
├── tests/                     # Backend test suite
├── frontend/                  # React Application
│   ├── src/
│   │   ├── components/        # ChatInterface, Sidebar, etc.
│   │   ├── lib/               # API clients
│   │   └── App.tsx            # Main layout
│   └── vite.config.ts         # Build config
│
├── e2e/                       # Playwright E2E tests
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Container config
└── .env                       # API Keys (Not committed)
```

## 📄 License
[MIT](https://choosealicense.com/licenses/mit/)

---

## 📚 Documentation

- **[API Documentation](./API_DOCS.md)** - Complete API reference
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[Maintenance Script](./maintenance.py)** - Database optimization and health checks

---

## ✨ Features & Highlights

### Production Ready
- ✅ Fully implemented RAG pipeline with hybrid retrieval (BM25 + FAISS)
- ✅ Background job processing for repository ingestion
- ✅ JWT authentication with guest mode support
- ✅ Rate limiting and security hardening
- ✅ Comprehensive error handling and logging
- ✅ Docker support with multi-stage builds
- ✅ Health checks and Prometheus metrics
- ✅ Session management and chat history
- ✅ Real-time streaming responses (SSE)
- ✅ AI-powered code diff analysis
- ✅ Qdrant vector persistence + Celery background ingestion
- ✅ Strict SSRF-safe repository URL validation
- ✅ Refresh token rotation with server-side revocation tracking
- ✅ File upload for contextual chat
- ✅ Multi-repository support
- ✅ Export to Markdown/HTML/JSON
- ✅ WebSocket support for real-time chat
- ✅ Code search and symbol indexing
- ✅ Secret scanning and redaction

### Performance Optimizations
- QA chain caching with 1-hour TTL
- Batch embedding processing with rate limiting
- Database connection pooling (production)
- Frontend code splitting and lazy loading
- GZip compression for API responses
- Efficient vector store with FAISS
- LRU cache eviction for memory management

### Security Features
- Secret key validation on startup
- CORS configuration
- SQL injection prevention (SQLAlchemy ORM)
- Input validation with Pydantic
- SSRF protection (GitHub URL validation only)
- Secret pattern detection and redaction
- Non-root Docker container user
- Security headers middleware

---

## 🔧 Maintenance

Run the maintenance script to optimize performance:

```bash
# Run all maintenance tasks
python maintenance.py

# Or specific tasks
python maintenance.py --db-only          # Optimize database
python maintenance.py --jobs-only        # Cleanup old jobs
python maintenance.py --repos-only       # Remove stale repos
python maintenance.py --report-only      # Generate health report
```

Generates:
- Database optimization (VACUUM, ANALYZE)
- Old job cleanup
- Stale repository removal
- System health report (saved to `health_report.json`)

---

## 🚀 Next Steps

After initial setup:

1. **Configure production settings** - See [DEPLOYMENT.md](./DEPLOYMENT.md)
2. **Set up monitoring** - Enable Prometheus metrics scraping
3. **Configure backups** - Automate database backups
4. **Scale workers** - Adjust worker count for your load
5. **Enable HTTPS** - Use reverse proxy (Nginx) with SSL

---

## 🙏 Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [LangChain](https://python.langchain.com/) - LLM application framework
- [Google Gemini](https://ai.google.dev/) - State-of-the-art LLM
- [FAISS](https://github.com/facebookresearch/faiss) - Efficient similarity search
- [React](https://react.dev/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

---

**Made with ❤️ for developers who want to understand their codebases better.**
