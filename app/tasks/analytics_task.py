"""Celery tasks for analytics and usage reporting."""

import logging
from datetime import datetime, timezone, timedelta

from app.tasks import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.analytics_task.generate_usage_report")
def generate_usage_report():
    """Generate daily usage report and store metrics."""
    import asyncio

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_generate_report())
        return result
    finally:
        loop.close()


async def _generate_report():
    """Aggregate usage data for the past 24 hours."""
    from sqlalchemy import func, select
    from app.core.database import (
        AsyncSessionLocal,
        UsageLog,
        UsageMetric,
        User,
        Repository,
        ChatMessage,
        generate_uuid,
    )

    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)

    async with AsyncSessionLocal() as session:
        # Count queries in last 24h
        query_count = await session.scalar(
            select(func.count(UsageLog.id)).where(
                UsageLog.event_type == "chat",
                UsageLog.created_at >= day_ago,
            )
        ) or 0

        # Count ingestions in last 24h
        ingest_count = await session.scalar(
            select(func.count(UsageLog.id)).where(
                UsageLog.event_type == "ingest",
                UsageLog.created_at >= day_ago,
            )
        ) or 0

        # Total users
        total_users = await session.scalar(
            select(func.count(User.id))
        ) or 0

        # Total repos
        total_repos = await session.scalar(
            select(func.count(Repository.id)).where(
                Repository.status == "ready"
            )
        ) or 0

        # Total messages in last 24h
        total_messages = await session.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.created_at >= day_ago,
            )
        ) or 0

        # Store aggregate metrics
        metrics = [
            UsageMetric(
                id=generate_uuid(),
                metric_type="daily_queries",
                value=float(query_count),
                recorded_at=now,
            ),
            UsageMetric(
                id=generate_uuid(),
                metric_type="daily_ingestions",
                value=float(ingest_count),
                recorded_at=now,
            ),
            UsageMetric(
                id=generate_uuid(),
                metric_type="total_users",
                value=float(total_users),
                recorded_at=now,
            ),
            UsageMetric(
                id=generate_uuid(),
                metric_type="total_repos",
                value=float(total_repos),
                recorded_at=now,
            ),
            UsageMetric(
                id=generate_uuid(),
                metric_type="daily_messages",
                value=float(total_messages),
                recorded_at=now,
            ),
        ]

        session.add_all(metrics)
        await session.commit()

        report = {
            "period_start": day_ago.isoformat(),
            "period_end": now.isoformat(),
            "queries": query_count,
            "ingestions": ingest_count,
            "total_users": total_users,
            "total_repos": total_repos,
            "messages": total_messages,
        }

        logger.info(f"Usage report generated: {report}")
        return report
