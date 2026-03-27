# Project Plan: Production Readiness Upgrade

> **Based on:** Honest Real-World Viability Audit
> **Goal:** Transform CodeRAG from a portfolio demo into a production-ready, scalable, and secure system.

## 📋 Executive Summary
This plan addresses critical gaps identified in the "Real-World Viability Audit". The primary focus is replacing lightweight/in-memory components (SQLite, threading, FAISS) with robust infrastructure (PostgreSQL, Redis/Celery, Qdrant) and closing fundamental security holes.

## 🔄 User Review Required
> [!IMPORTANT]
> **Major Infrastructure Changes**
> - **Database:** Migration from SQLite (`coderag.db`) to **PostgreSQL**. Existing data will not be automatically migrated.
> - **Queue:** replacing in-memory Python queue with **Redis + Celery**. Requires Redis service.
> - **Vector Store:** replacing in-memory FAISS with **Qdrant**.
> 
> **Docker Requirement:** This upgrade strictly requires Docker/Docker Compose to run the new infrastructure services locally.

## 🗓️ Roadmap

### Phase 1: Infrastructure (Critical Foundation)
**Goal:** Replace "toy" infrastructure with production-grade services to ensure reliability and data persistence.

- [ ] **1.1. PostgreSQL Migration**
  - [ ] Configure `SQL_ALCHEMY_DATABASE_URL` for Postgres
  - [ ] Implement `alembic` for migrations (init, revision, upgrade)
  - [ ] Update `docker-compose.yml` to include Postgres service
  - [ ] Verify `get_db` yields async sessions correctly without blocking

- [ ] **1.2. Redis + Celery Implementation**
  - [ ] Add Redis service to `docker-compose.yml`
  - [ ] Refactor `worker.py` to use `Celery` instead of threading
  - [ ] Persist jobs to Redis; ensure resilience to restarts
  - [ ] Update job status tracking in DB

- [ ] **1.3. Vector Store Upgrade (Qdrant)**
  - [ ] Add Qdrant service to `docker-compose.yml`
  - [ ] Refactor `rag_engine.py` to use `Qdrant` client
  - [ ] Remove FAISS dependency and local pickle handling
  - [ ] Ensure vector ingestion writes to Qdrant

- [ ] **1.4. Dependency Management**
  - [ ] Pin ALL versions in `requirements.txt` (prevent future breakages)

### Phase 2: Security (Critical Hardening)
**Goal:** Close remote code execution (RCE) vulnerabilities and secure authentication.

- [ ] **2.1. Secret Key Enforcement**
  - [ ] Modify `config.py` to **crash** (raise Error) if default `SECRET_KEY` is present
  - [ ] Document strict `.env` requirements

- [ ] **2.2. Auth Hardening**
  - [ ] detailed analysis of `auth.py`
  - [ ] Reduce `ACCESS_TOKEN_EXPIRE_MINUTES` (e.g., to 60 mins)
  - [ ] Implement Refresh Token rotation flow
  - [ ] Add per-IP rate limiting to `/login` and `/register` endpoints

- [ ] **2.3. Safe Serialization**
  - [ ] **Eliminate `pickle` usage completely**
  - [ ] Verify `rag_engine` uses JSON/MsgPack or DB-native storage only

- [ ] **2.4. SSRF & Input Validation**
  - [ ] Implement strict allowlist/blocklist for Git URLs (block `127.0.0.1`, `10.x`, etc.)

### Phase 3: Quality & Reliability
**Goal:** Ensure system stability through testing and non-blocking architecture.

- [ ] **3.1. Async Optimization**
  - [ ] Audit all DB calls; ensure no sync `db.query` inside async routes
  - [ ] Verify thread-pool usage for CPU-bound tasks (e.g., LangChain invoke)

- [ ] **3.2. Integration Testing**
  - [ ] Create `tests/test_flow.py`: Real End-to-End test (Ingest -> Index -> Chat) using Docker services
  - [ ] Ensure usage of `pytest-asyncio`

- [ ] **3.3. Streaming Response**
  - [ ] Refactor `rag_engine` to support `chain.astream()`
  - [ ] Update API endpoint to return `StreamingResponse` (SSE)

- [ ] **3.4. Component Refactoring**
  - [ ] Split `RepositoryIngestion.tsx` into smaller sub-components
  - [ ] Split `App.tsx` if bloated

### Phase 4: Scale & Observability (Growth)
**Goal:** Prepare for multi-user/multi-tenant usage.

- [ ] **4.1. Observability**
  - [ ] Add OpenTelemetry instrumentation (traces for API + Celery)
  - [ ] centralized structured logging

- [ ] **4.2. Multi-tenancy Prep**
  - [ ] Review schema for OrgID/TenantID columns (Architecture Decision)

## ✅ Definition of Done
1. Application starts with `docker-compose up` without errors.
2. Ingestion persists across container restarts (Redis/Postgres).
3. No `pickle` imports in the codebase.
4. E2E test passes against real infrastructure.
5. Default credentials constitute a startup error.
