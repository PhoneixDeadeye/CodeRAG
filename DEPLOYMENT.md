# 🚀 CodeRAG Production Deployment Guide

This guide covers deploying CodeRAG to production environments with best practices for security, performance, and reliability.

## 📋 Prerequisites

- Docker & Docker Compose (v20.10+)
- Google Cloud Platform account (for Gemini API)
- Domain name (optional, for HTTPS)
- Minimum 4GB RAM, 2 CPU cores, 20GB storage

## 🔧 Environment Configuration

### 1. Create Production Environment File

Create `.env.production` in the project root:

```bash
# === REQUIRED SETTINGS ===

# Google Gemini API Key (Get from https://aistudio.google.com/app/apikey)
GOOGLE_API_KEY=your_actual_api_key_here

# Secret key for JWT tokens (Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))")
SECRET_KEY=your_secure_random_secret_key_here

# === OPTIONAL SETTINGS ===

# CORS Origins (comma-separated, include your domain)
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Database URL (default: SQLite, for production consider PostgreSQL)
# SQL_ALCHEMY_DATABASE_URL=postgresql://user:password@postgres:5432/coderag

# Rate Limits
CHAT_RATE_LIMIT=50
INGEST_RATE_LIMIT=5

# Logging
LOG_LEVEL=INFO

# API URL for frontend
VITE_API_URL=https://your-domain.com/api
```

### 2. Security Checklist

- [ ] **Replace SECRET_KEY** with a cryptographically secure random string
- [ ] **Set GOOGLE_API_KEY** from your Google Cloud project
- [ ] **Configure CORS_ORIGINS** to only include your production domain(s)
- [ ] **Never commit** `.env` or `.env.production` to version control
- [ ] **Enable HTTPS** using a reverse proxy (see below)
- [ ] **Set up firewall rules** to restrict access to port 8000

## 🐳 Docker Deployment

### Option 1: Docker Compose (Recommended for Single Server)

```bash
# Build and start services
docker-compose --env-file .env.production up -d --build

# Check logs
docker-compose logs -f backend

# Scale workers if needed
docker-compose up -d --scale backend=3
```

### Option 2: Docker Run (Manual)

```bash
# Build image
docker build -t coderag:latest .

# Run container
docker run -d \
  --name coderag-backend \
  -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  --env-file .env.production \
  --restart unless-stopped \
  coderag:latest
```

### Frontend Deployment

```bash
# Build production frontend
cd frontend
npm run build

# Serve with nginx or deploy dist/ to CDN
```

## 🌐 Reverse Proxy Setup (HTTPS)

### Nginx Configuration

Create `/etc/nginx/sites-available/coderag`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Certificate (use Certbot for Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Frontend
    location / {
        root /var/www/coderag/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 300s;
    }
    
    # WebSocket support
    location /api/v1/ws {
        proxy_pass http://localhost:8000/api/v1/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
    
    # Metrics endpoint (restrict access)
    location /metrics {
        proxy_pass http://localhost:8000/metrics;
        allow 127.0.0.1;
        deny all;
    }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/coderag /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (cron already set up by certbot)
sudo certbot renew --dry-run
```

## 📊 Monitoring & Observability

### Prometheus Metrics

CodeRAG exposes metrics at `/metrics` endpoint:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'coderag'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: /metrics
```

Key metrics:
- `http_requests_total` - Total API requests
- `http_request_duration_seconds` - Request latency
- `llm_invocation_duration_seconds` - LLM response time
- `embeddings_generated_total` - Embedding operations

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Response: {"status":"healthy","version":"3.0","service":"CodeRAG SaaS API"}
```

### Log Management

Logs are written to stdout/stderr. Collect with:

```bash
# Docker logs
docker-compose logs -f --tail=100 backend

# Or use a log aggregator (e.g., ELK Stack, Loki)
```

## 🔒 Security Hardening

### 1. Rate Limiting

Already implemented in code. Adjust limits in `.env`:
```bash
CHAT_RATE_LIMIT=50  # requests per minute per user
INGEST_RATE_LIMIT=5  # ingestions per hour per user
```

### 2. Secret Scanning

Enable secret scanning in ingestion (already implemented):
- Redacts API keys, passwords, tokens before indexing
- Patterns defined in `app/services/ingest.py`

### 3. Input Validation

All endpoints validate inputs using Pydantic models:
- Max query length: 5000 chars
- Max file size: 10MB
- GitHub URL validation (prevents SSRF)

### 4. Database Backup

SQLite (default):
```bash
# Backup
cp coderag.db coderag.db.backup

# Automated backups (cron)
0 2 * * * cp /path/to/coderag.db /backup/coderag.$(date +\%Y\%m\%d).db
```

PostgreSQL (recommended for production):
```bash
# Backup
pg_dump coderag > backup.sql

# Restore
psql coderag < backup.sql
```

## 🚀 Cloud Deployment Options

### AWS EC2

1. Launch EC2 instance (t3.medium or larger)
2. Install Docker & Docker Compose
3. Clone repository
4. Configure `.env.production`
5. Run `docker-compose up -d`
6. Set up Elastic IP and Route53 DNS
7. Configure Security Groups (allow 80, 443)

### Google Cloud Run

```bash
# Build and push image
gcloud builds submit --tag gcr.io/PROJECT_ID/coderag

# Deploy
gcloud run deploy coderag \
  --image gcr.io/PROJECT_ID/coderag \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_API_KEY=xxx,SECRET_KEY=xxx
```

### DigitalOcean App Platform

1. Connect GitHub repository
2. Configure environment variables in dashboard
3. Deploy with auto-scaling and managed databases

## 📈 Performance Optimization

### 1. Vector DB Optimization

```python
# Already implemented in code:
# - QA chain caching (1-hour TTL)
# - Batch embedding processing
# - Hybrid retrieval (BM25 + FAISS)
```

### 2. Worker Scaling

```bash
# Increase background workers
# Edit docker-compose.yml:
environment:
  - MAX_WORKERS=6  # Default: 3
```

### 3. Database Connection Pooling

For PostgreSQL, configure pool size:
```python
# In app/core/database.py (already optimized for SQLite)
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20
)
```

## 🔄 Updates & Maintenance

### Update Application

```bash
# Pull latest code
git pull origin main

# Rebuild containers
docker-compose down
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

### Database Migrations

```bash
# If using Alembic (not currently configured)
alembic upgrade head
```

### Cleanup Old Jobs

```bash
# Worker automatically cleans jobs older than 24 hours
# Manual cleanup if needed:
curl -X POST http://localhost:8000/api/v1/admin/cleanup
```

## 🐛 Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Missing GOOGLE_API_KEY
# - Port 8000 already in use
# - Insufficient memory
```

### Out of memory
```bash
# Increase Docker memory limit (Docker Desktop)
# Or add swap on Linux:
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Slow ingestion
```bash
# Check API quota limits
# Reduce EMBEDDING_BATCH_SIZE in app/services/rag_engine.py
# Increase EMBEDDING_BATCH_DELAY for rate limiting
```

## 📞 Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/coderag/issues
- Documentation: See README.md
- API Docs: http://localhost:8000/docs

## 📝 Production Checklist

Before going live:

- [ ] Set strong SECRET_KEY
- [ ] Configure CORS_ORIGINS for your domain
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Set up database backups
- [ ] Configure monitoring (Prometheus + Grafana)
- [ ] Set up log aggregation
- [ ] Test health checks and auto-restart
- [ ] Configure rate limiting appropriately
- [ ] Review and test all API endpoints
- [ ] Perform load testing
- [ ] Set up alerting for errors/downtime
- [ ] Document incident response procedures
- [ ] Enable automated backups
- [ ] Test disaster recovery procedures

## 🎉 Launch!

Once everything is configured and tested:

```bash
docker-compose --env-file .env.production up -d

# Verify
curl https://your-domain.com/health
```

Your CodeRAG instance is now live! 🚀
