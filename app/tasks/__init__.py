"""Celery application configuration for CodeRAG background tasks.

Uses Redis as broker and result backend.
"""

import os
from celery import Celery

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

celery_app = Celery(
    "coderag",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.ingest_task",
        "app.tasks.analytics_task",
    ],
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Retry policy
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Result expiry (24 hours)
    result_expires=86400,
    # Priority queues
    task_default_queue="default",
    task_queues={
        "high": {"exchange": "high", "routing_key": "high"},
        "default": {"exchange": "default", "routing_key": "default"},
        "low": {"exchange": "low", "routing_key": "low"},
    },
    task_routes={
        "app.tasks.ingest_task.ingest_repository_task": {"queue": "default"},
        "app.tasks.analytics_task.generate_usage_report": {"queue": "low"},
    },
    # Beat schedule for periodic tasks
    beat_schedule={
        "cleanup-stale-repos": {
            "task": "app.tasks.ingest_task.cleanup_stale_repos_task",
            "schedule": 3600.0,  # Every hour
        },
        "generate-daily-usage-report": {
            "task": "app.tasks.analytics_task.generate_usage_report",
            "schedule": 86400.0,  # Every 24 hours
        },
    },
)
