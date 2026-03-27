# 🚀 CodeRAG - Quick Run Guide

**Status: ✅ Production Ready | Version: 3.0**

This guide gets CodeRAG running on your machine in under 5 minutes.

---

## ⚡ Fast Track (Copy-Paste)

### Windows (PowerShell)

```powershell
# 1. Clone and enter directory
git clone <repository-url> coderag
cd coderag

# 2. Setup (automated)
python setup.py

# 3. Configure API key
# Edit .env file and set your GOOGLE_API_KEY

# 4. Start backend
venv\Scripts\activate
uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000

# 5. Start frontend (new terminal)
cd frontend
npm run dev
```

### Linux/Mac (Bash)

```bash
# 1. Clone and enter directory
git clone <repository-url> coderag
cd coderag

# 2. Setup (automated)
python3 setup.py

# 3. Configure API key
# Edit .env file and set your GOOGLE_API_KEY

# 4. Start backend
source venv/bin/activate
uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000

# 5. Start frontend (new terminal)
cd frontend
npm run dev
```

**Access:** http://localhost:5173

---

## 📋 Prerequisites

Before starting, ensure you have:

- ✅ **Python 3.10+** - [Download](https://www.python.org/downloads/)
- ✅ **Node.js 18+** - [Download](https://nodejs.org/)
- ✅ **Git** - [Download](https://git-scm.com/)
- ✅ **Docker & Docker Compose** (Recommended for Database/Redis)
- ✅ **Google API Key** - [Get it here](https://aistudio.google.com/app/apikey)

**Check installations:**
```bash
python --version   # Should be 3.10 or higher
node --version     # Should be v18 or higher
git --version      # Any recent version
```

---

## 🔧 Detailed Setup

### Step 1: Get the Code

```bash
git clone <repository-url> coderag
cd coderag
```

### Step 2: Backend Setup

#### Option A: Automated Setup (Recommended)

```bash
python setup.py
```

This script will:
- Check prerequisites
- Create virtual environment
- Install dependencies
- Setup .env file
- Create necessary directories
- Verify installation

#### Option B: Manual Setup

```bash
# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate
# OR Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

### Step 3: Configure Environment

Edit `.env` file and set:

```bash
# REQUIRED - Get from https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=your_actual_api_key_here

# REQUIRED - Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=your_secure_random_key_here

# Database Config (Defaults to Postgres)
# Ensure you have Postgres running on localhost:5432 or update this URL
SQL_ALCHEMY_DATABASE_URL=postgresql+asyncpg://coderag:coderag@localhost:5432/coderag
# For SQLite (limited features): SQL_ALCHEMY_DATABASE_URL=sqlite+aiosqlite:///./coderag.db

# Redis Config (Required for Background Workers)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

**Quick Secret Key Generation:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 3.5: Start Infrastructure (Postgres & Redis)
*Skip this if using SQLite (not recommended)*

```bash
# Use Docker to start just the DB services
docker-compose up -d postgres redis
```

### Step 4: Frontend Setup

```bash
cd frontend
npm install
cd ..
```

### Step 5: Start Services

#### Terminal 1 - Backend

```bash
# Activate virtual environment (if not already active)
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Start backend server
uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000
```

**Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

#### Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

**Output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 6: Access Application

Open browser and navigate to:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

---

## 🎯 First Use

### 1. Create Account or Use Guest Mode

**Option A: Register**
- Click "Register" on login page
- Enter email and password
- Get full features (sessions, history)

**Option B: Guest Mode**
- Click "Continue as Guest"
- Limited features but works immediately

### 2. Ingest a Repository

- Click sidebar menu (☰)
- Select "Repositories"
- Paste a public GitHub URL:
  ```
  https://github.com/fastapi/fastapi
  https://github.com/langchain-ai/langchain
  https://github.com/pallets/flask
  ```
- Click "Ingest Repository"
- Wait for indexing (1-5 minutes depending on size)

### 3. Start Chatting

Once status shows "ready":
- Click "Chat" in sidebar
- Ask questions like:
  - "How is authentication implemented?"
  - "Explain the main application structure"
  - "Where is the database configuration?"
  - "Show me the API routes"

### 4. Explore Features

- **View Sources:** Click on source documents to see code
- **File Explorer:** Browse repository files
- **Code Search:** Search for specific code patterns
- **Diff Analysis:** Compare code changes
- **Export Chat:** Save conversations

---

## 🐳 Docker Deployment

### Quick Start with Docker Compose

```bash
# Create .env file first (with GOOGLE_API_KEY)
cp .env.example .env
# Edit .env with your API key

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

**Access:** http://localhost:5173

### Manual Docker Build

```bash
# Build image
docker build -t coderag:latest .

# Run container
docker run -d \
  --name coderag \
  -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  -e GOOGLE_API_KEY=your_key_here \
  -e SECRET_KEY=your_secret_here \
  coderag:latest

# Check logs
docker logs -f coderag
```

---

## 🔍 Verification

### Backend Health Check

```bash
curl http://localhost:8000/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "version": "3.0",
  "service": "CodeRAG SaaS API"
}
```

### Frontend Loading

Browser console should show:
```
[CodeRAG] Application initialized
[CodeRAG] API connection established
```

### Test API (Optional)

```bash
# Get API documentation
curl http://localhost:8000/openapi.json

# Test guest chat (requires repo ingested)
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What is this repository about?"}'
```

---

## 🛠️ Maintenance

### Database Optimization

```bash
# Run maintenance script
python maintenance.py

# Or specific tasks
python maintenance.py --db-only      # Optimize database
python maintenance.py --report-only  # Generate report
```

### Update Dependencies

```bash
# Backend
pip install -r requirements.txt --upgrade

# Frontend
cd frontend
npm update
```

### Clean Up

```bash
# Remove old jobs and repos
python maintenance.py --jobs-only --repos-only

# Clear cache
rm -rf __pycache__
rm -rf app/**/__pycache__
```

---

## 🐛 Troubleshooting

### Issue: "GOOGLE_API_KEY not found"

**Solution:**
```bash
# Verify .env file exists
ls -la .env

# Check content
cat .env | grep GOOGLE_API_KEY

# Should show: GOOGLE_API_KEY=your_actual_key
```

### Issue: Port 8000 already in use

**Solution:**
```bash
# Find process using port
# Windows:
netstat -ano | findstr :8000
# Linux/Mac:
lsof -i :8000

# Kill process or use different port
uvicorn app.api.main:app --port 8001
```

### Issue: Import errors

**Solution:**
```bash
# Ensure virtual environment is activated
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Issue: Frontend won't start

**Solution:**
```bash
cd frontend

# Remove node_modules and reinstall
rm -rf node_modules
npm install

# Clear cache
npm cache clean --force
npm install
```

### Issue: Ingestion fails

**Possible causes:**
1. **Invalid GitHub URL** - Must be public GitHub repository
2. **Network issues** - Check internet connection
3. **API quota** - Wait a few minutes and retry
4. **Large repository** - May take 5-10 minutes

**Check logs:**
```bash
# Backend logs show detailed errors
docker-compose logs backend
# Or in development:
# Terminal running uvicorn shows errors
```

### Issue: Out of memory

**Solution:**
```bash
# Reduce batch size in app/services/rag_engine.py
# Change EMBEDDING_BATCH_SIZE from 50 to 25

# Or increase system memory
# Docker Desktop: Settings > Resources > Memory
```

---

## 📊 Resource Usage

**Typical resource consumption:**

| Component | RAM | CPU | Disk |
|-----------|-----|-----|------|
| Backend | 400-600 MB | 10-30% | 100 MB + repos |
| Frontend | 200-300 MB | 5-15% | 50 MB |
| Data | - | - | ~5-50 MB per repo |

**Minimum requirements:**
- 4 GB RAM
- 2 CPU cores
- 10 GB free disk space

**Recommended:**
- 8 GB RAM
- 4 CPU cores
- 50 GB free disk space (for multiple repos)

---

## 🎓 Learning Resources

### Documentation
- **[README.md](./README.md)** - Overview and features
- **[API_DOCS.md](./API_DOCS.md)** - Complete API reference
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment
- **[PROJECT_COMPLETION.md](./PROJECT_COMPLETION.md)** - Project details
- **[CHANGES.md](./CHANGES.md)** - What was improved

### API Exploration
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **OpenAPI Schema:** http://localhost:8000/openapi.json

### Code Examples

**Python API Client:**
```python
import requests

# Chat with repository
response = requests.post(
    "http://localhost:8000/api/v1/chat",
    json={"query": "How does auth work?"},
    headers={"Authorization": "Bearer YOUR_TOKEN"}
)
print(response.json()["answer"])
```

**JavaScript API Client:**
```javascript
// Chat with repository
const response = await fetch('http://localhost:8000/api/v1/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN'
    },
    body: JSON.stringify({
        query: 'How does auth work?'
    })
});
const data = await response.json();
console.log(data.answer);
```

---

## 🚀 Next Steps

After successful setup:

1. **Ingest your own repository**
2. **Explore different queries**
3. **Try file upload for context**
4. **Export conversations**
5. **Check out advanced features** (diff analysis, code search)
6. **Read [DEPLOYMENT.md](./DEPLOYMENT.md)** for production setup

---

## 💡 Tips & Tricks

### Performance
- First query on a repo is slow (8-12s) - subsequent queries are cached (2-4s)
- Smaller repos index faster (<1 minute)
- Large repos may take 5-10 minutes to index

### Best Questions
- ✅ "How is X implemented?"
- ✅ "Explain the architecture"
- ✅ "Where is the database configured?"
- ✅ "Show me examples of Y"
- ❌ "Write me a new feature" (not trained for code generation)

### Keyboard Shortcuts
- `Ctrl/Cmd + K` - Focus search
- `Ctrl/Cmd + /` - Show shortcuts
- `Esc` - Close modals

---

## 📞 Getting Help

### Check Logs
```bash
# Backend logs
docker-compose logs backend
# Or terminal running uvicorn

# Frontend logs
# Open browser console (F12)
```

### Health Report
```bash
python maintenance.py --report-only
cat health_report.json
```

### Common Questions

**Q: How long does ingestion take?**
A: 1-10 minutes depending on repository size. FastAPI (~500 files) = 2-3 minutes.

**Q: Can I use private repositories?**
A: Not currently. Only public GitHub URLs are supported.

**Q: How many repos can I ingest?**
A: Unlimited, but each repo uses ~5-50 MB of disk space.

**Q: Is my data stored?**
A: All data is local. No external data storage except Google Gemini API calls.

**Q: Can I change the LLM?**
A: Currently only Gemini is supported. OpenAI support is a future enhancement.

---

## ✅ Quick Checklist

Before reporting issues, verify:

- [ ] Python 3.10+ installed
- [ ] Node.js 18+ installed
- [ ] Virtual environment activated
- [ ] All dependencies installed
- [ ] .env file configured with GOOGLE_API_KEY
- [ ] Backend running on port 8000
- [ ] Frontend running on port 5173
- [ ] No firewall blocking ports
- [ ] Internet connection working

---

**Need more help?**
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for advanced topics
- See [API_DOCS.md](./API_DOCS.md) for API reference
- Review logs for specific errors

**Happy coding! 🎉**
