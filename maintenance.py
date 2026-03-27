#!/usr/bin/env python3
"""
CodeRAG Database Optimization and Maintenance Script

This script performs various maintenance tasks:
- Vacuum and optimize SQLite database
- Clean up old job records
- Remove stale repository data
- Clear expired QA chain cache
- Report system health metrics
"""

import os
import sys
import sqlite3
import shutil
from pathlib import Path
from datetime import datetime, timedelta, timezone
import json

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.database import SessionLocal, Repository, ChatSession, UsageLog
from app.services.worker import get_worker
from app.services.rag_engine import clear_qa_chain_cache


def optimize_database():
    """Optimize SQLite database with VACUUM and ANALYZE."""
    print("[DATABASE] Optimizing database...")

    db_path = "coderag.db"
    if not os.path.exists(db_path):
        print(f"[SKIP] Database file not found: {db_path}")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get database size before
        size_before = os.path.getsize(db_path) / (1024 * 1024)  # MB

        # Vacuum to reclaim space and optimize
        print("  Running VACUUM...")
        cursor.execute("VACUUM")

        # Analyze to update statistics
        print("  Running ANALYZE...")
        cursor.execute("ANALYZE")

        conn.commit()
        conn.close()

        # Get database size after
        size_after = os.path.getsize(db_path) / (1024 * 1024)  # MB
        space_saved = size_before - size_after

        print("[OK] Database optimized")
        print(f"  Size before: {size_before:.2f} MB")
        print(f"  Size after:  {size_after:.2f} MB")
        print(f"  Space saved: {space_saved:.2f} MB")

    except Exception as e:
        print(f"[ERROR] Database optimization failed: {e}")


def cleanup_old_jobs(max_age_hours: int = 24):
    """Clean up old completed/failed background jobs."""
    print(f"[JOBS] Cleaning up jobs older than {max_age_hours} hours...")

    try:
        worker = get_worker()
        initial_count = len(worker._jobs)

        worker.cleanup_old_jobs(max_age_hours=max_age_hours)

        final_count = len(worker._jobs)
        removed = initial_count - final_count

        print(f"[OK] Removed {removed} old jobs")
        print(f"  Jobs remaining: {final_count}")

    except Exception as e:
        print(f"[ERROR] Job cleanup failed: {e}")


def cleanup_stale_repos(days: int = 30):
    """Remove repository data for failed/abandoned ingestions older than N days."""
    print(f"[REPOS] Cleaning up stale repositories older than {days} days...")

    db = SessionLocal()
    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        stale_repos = (
            db.query(Repository)
            .filter(
                Repository.status.in_(["failed", "pending"]),
                Repository.created_at < cutoff_date,
            )
            .all()
        )

        removed_count = 0
        freed_space = 0

        for repo in stale_repos:
            try:
                # Remove local files
                if repo.local_path and os.path.exists(repo.local_path):
                    size = sum(
                        f.stat().st_size
                        for f in Path(repo.local_path).rglob("*")
                        if f.is_file()
                    )
                    shutil.rmtree(repo.local_path)
                    freed_space += size

                # Remove vector DB
                if repo.vector_db_path and os.path.exists(repo.vector_db_path):
                    size = sum(
                        f.stat().st_size
                        for f in Path(repo.vector_db_path).rglob("*")
                        if f.is_file()
                    )
                    shutil.rmtree(repo.vector_db_path)
                    freed_space += size

                # Remove from database
                db.delete(repo)
                removed_count += 1

            except Exception as e:
                print(f"  [WARN] Failed to remove repo {repo.id}: {e}")

        db.commit()

        freed_mb = freed_space / (1024 * 1024)
        print(f"[OK] Removed {removed_count} stale repositories")
        print(f"  Disk space freed: {freed_mb:.2f} MB")

    except Exception as e:
        print(f"[ERROR] Repository cleanup failed: {e}")
        db.rollback()
    finally:
        db.close()


def clear_cache():
    """Clear QA chain cache and other caches."""
    print("[CACHE] Clearing QA chain cache...")

    try:
        clear_qa_chain_cache()
        print("[OK] Cache cleared")
    except Exception as e:
        print(f"[ERROR] Cache clear failed: {e}")


def generate_health_report():
    """Generate system health and usage report."""
    print("\n[REPORT] Generating health report...")

    db = SessionLocal()
    try:
        # Repository statistics
        total_repos = db.query(Repository).count()
        ready_repos = db.query(Repository).filter(Repository.status == "ready").count()
        failed_repos = (
            db.query(Repository).filter(Repository.status == "failed").count()
        )
        indexing_repos = (
            db.query(Repository)
            .filter(Repository.status.in_(["indexing", "cloning"]))
            .count()
        )

        # Session statistics
        total_sessions = db.query(ChatSession).count()
        active_sessions_week = (
            db.query(ChatSession)
            .filter(
                ChatSession.updated_at >= datetime.now(timezone.utc) - timedelta(days=7)
            )
            .count()
        )

        # Usage statistics
        total_chats = db.query(UsageLog).filter(UsageLog.event_type == "chat").count()
        chats_today = (
            db.query(UsageLog)
            .filter(
                UsageLog.event_type == "chat",
                UsageLog.created_at >= datetime.now(timezone.utc) - timedelta(days=1),
            )
            .count()
        )

        # Disk usage
        data_size = 0
        if os.path.exists(settings.DATA_DIR):
            data_size = sum(
                f.stat().st_size
                for f in Path(settings.DATA_DIR).rglob("*")
                if f.is_file()
            )
        data_size_mb = data_size / (1024 * 1024)

        # Database size
        db_size = 0
        if os.path.exists("coderag.db"):
            db_size = os.path.getsize("coderag.db") / (1024 * 1024)

        print("\n" + "=" * 60)
        print("SYSTEM HEALTH REPORT".center(60))
        print("=" * 60)
        print(f"\nGenerated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

        print("REPOSITORIES:")
        print(f"  Total:     {total_repos}")
        print(f"  Ready:     {ready_repos}")
        print(f"  Failed:    {failed_repos}")
        print(f"  Indexing:  {indexing_repos}")

        print("\nSESSIONS:")
        print(f"  Total sessions:      {total_sessions}")
        print(f"  Active (last week):  {active_sessions_week}")

        print("\nUSAGE:")
        print(f"  Total chats:   {total_chats}")
        print(f"  Chats today:   {chats_today}")

        print("\nSTORAGE:")
        print(f"  Data directory:  {data_size_mb:.2f} MB")
        print(f"  Database:        {db_size:.2f} MB")
        print(f"  Total:           {(data_size_mb + db_size):.2f} MB")

        print("\n" + "=" * 60 + "\n")

        # Save report to file
        report = {
            "timestamp": datetime.now().isoformat(),
            "repositories": {
                "total": total_repos,
                "ready": ready_repos,
                "failed": failed_repos,
                "indexing": indexing_repos,
            },
            "sessions": {"total": total_sessions, "active_week": active_sessions_week},
            "usage": {"total_chats": total_chats, "chats_today": chats_today},
            "storage_mb": {
                "data": round(data_size_mb, 2),
                "database": round(db_size, 2),
                "total": round(data_size_mb + db_size, 2),
            },
        }

        with open("health_report.json", "w") as f:
            json.dump(report, f, indent=2)

        print("[OK] Report saved to health_report.json")

    except Exception as e:
        print(f"[ERROR] Report generation failed: {e}")
    finally:
        db.close()


def main():
    """Run all maintenance tasks."""
    print("\n" + "=" * 60)
    print("CodeRAG Maintenance & Optimization".center(60))
    print("=" * 60 + "\n")

    # 1. Optimize database
    optimize_database()
    print()

    # 2. Cleanup old jobs
    cleanup_old_jobs(max_age_hours=24)
    print()

    # 3. Cleanup stale repos
    cleanup_stale_repos(days=30)
    print()

    # 4. Clear caches
    clear_cache()
    print()

    # 5. Generate health report
    generate_health_report()

    print("[DONE] Maintenance completed successfully!\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="CodeRAG maintenance and optimization script"
    )
    parser.add_argument("--db-only", action="store_true", help="Only optimize database")
    parser.add_argument("--jobs-only", action="store_true", help="Only cleanup jobs")
    parser.add_argument(
        "--repos-only", action="store_true", help="Only cleanup repositories"
    )
    parser.add_argument(
        "--report-only", action="store_true", help="Only generate report"
    )
    parser.add_argument(
        "--job-age",
        type=int,
        default=24,
        help="Max age for jobs in hours (default: 24)",
    )
    parser.add_argument(
        "--repo-age",
        type=int,
        default=30,
        help="Max age for stale repos in days (default: 30)",
    )

    args = parser.parse_args()

    if args.db_only:
        optimize_database()
    elif args.jobs_only:
        cleanup_old_jobs(max_age_hours=args.job_age)
    elif args.repos_only:
        cleanup_stale_repos(days=args.repo_age)
    elif args.report_only:
        generate_health_report()
    else:
        main()
