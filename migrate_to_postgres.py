#!/usr/bin/env python3
"""
PostgreSQL Migration Script

Migrates SQLite database to PostgreSQL for production use.
This script should be run after setting up PostgreSQL.

Usage:
    1. Start PostgreSQL (e.g., via docker-compose)
    2. Set environment variables:
       - POSTGRES_URL=postgresql://user:pass@localhost:5432/coderag
    3. Run: python migrate_to_postgres.py
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Source (SQLite)
SQLITE_URL = os.getenv("SQLITE_URL", "sqlite:///./coderag.db")

# Target (PostgreSQL)  
POSTGRES_URL = os.getenv(
    "POSTGRES_URL", 
    "postgresql://coderag:coderag_dev@localhost:5432/coderag"
)


def get_table_data(engine, table_name: str) -> list:
    """Extract all rows from a table."""
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {table_name}"))
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
    return rows


def migrate_table(sqlite_engine, postgres_engine, table_name: str) -> int:
    """Migrate a single table from SQLite to PostgreSQL."""
    rows = get_table_data(sqlite_engine, table_name)
    
    if not rows:
        logger.info(f"  ⚪ {table_name}: No data to migrate")
        return 0
    
    # Build insert statement
    columns = list(rows[0].keys())
    placeholders = ", ".join([f":{col}" for col in columns])
    column_list = ", ".join(columns)
    
    insert_sql = text(f"""
        INSERT INTO {table_name} ({column_list})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    """)
    
    with postgres_engine.begin() as conn:
        for row in rows:
            conn.execute(insert_sql, row)
    
    logger.info(f"  ✅ {table_name}: Migrated {len(rows)} rows")
    return len(rows)


def main():
    """Run the migration."""
    logger.info("=" * 60)
    logger.info("🚀 PostgreSQL Migration Script")
    logger.info("=" * 60)
    
    # Validate PostgreSQL URL
    if "postgresql" not in POSTGRES_URL:
        logger.error("❌ POSTGRES_URL must be a PostgreSQL connection string")
        sys.exit(1)
    
    # Connect to databases
    logger.info(f"📂 Source: {SQLITE_URL}")
    logger.info(f"🐘 Target: {POSTGRES_URL.split('@')[1] if '@' in POSTGRES_URL else POSTGRES_URL}")
    
    try:
        sqlite_engine = create_engine(SQLITE_URL)
        postgres_engine = create_engine(POSTGRES_URL)
    except Exception as e:
        logger.error(f"❌ Failed to connect: {e}")
        sys.exit(1)
    
    # Create tables in PostgreSQL (using SQLAlchemy models)
    logger.info("\n📋 Creating tables in PostgreSQL...")
    try:
        from database import Base
        Base.metadata.create_all(bind=postgres_engine)
        logger.info("  ✅ Tables created")
    except Exception as e:
        logger.error(f"  ❌ Failed to create tables: {e}")
        sys.exit(1)
    
    # Migration order (respecting foreign keys)
    tables = [
        "users",
        "repositories", 
        "chat_sessions",
        "chat_messages",
        "usage_logs",
        "feedback"
    ]
    
    # Migrate each table
    logger.info("\n📦 Migrating data...")
    total_rows = 0
    for table in tables:
        try:
            total_rows += migrate_table(sqlite_engine, postgres_engine, table)
        except Exception as e:
            logger.error(f"  ❌ {table}: Migration failed - {e}")
    
    logger.info("\n" + "=" * 60)
    logger.info(f"✅ Migration complete! Total rows: {total_rows}")
    logger.info("=" * 60)
    
    # Verification
    logger.info("\n📊 Verification:")
    with postgres_engine.connect() as conn:
        for table in tables:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
            count = result.scalar()
            logger.info(f"  {table}: {count} rows")


if __name__ == "__main__":
    main()
