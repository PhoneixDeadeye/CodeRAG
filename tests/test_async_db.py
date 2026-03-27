import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, select

# Define a minimal model for testing
Base = declarative_base()


class SampleModel(Base):
    __tablename__ = "test_model"
    id = Column(Integer, primary_key=True)
    name = Column(String)


@pytest.mark.asyncio
async def test_async_sqlite_connection():
    """Verify that we can connect to SQLite asynchronously."""
    # Use in-memory SQLite for testing
    DATABASE_URL = "sqlite+aiosqlite:///:memory:"

    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    # 1. Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Add data
    async with async_session() as session:
        async with session.begin():
            session.add(SampleModel(name="Async Test Item"))

        # 3. Query data
        result = await session.execute(
            select(SampleModel).filter_by(name="Async Test Item")
        )
        item = result.scalars().first()

        assert item is not None
        assert item.name == "Async Test Item"

    await engine.dispose()
