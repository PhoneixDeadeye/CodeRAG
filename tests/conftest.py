import pytest
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure we set testing env vars before importing app
os.environ["TESTING"] = "True"
os.environ["GOOGLE_API_KEY"] = "test_key"  # Mock key for tests

from database import Base, get_db
from api import app

# Use in-memory SQLite for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def test_db():
    # Create tables
    Base.metadata.create_all(bind=engine)
    yield TestingSessionLocal
    # Drop tables
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="module")
def client(test_db):
    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Mock Auth - both required and optional user dependencies
    from auth import get_current_user, get_optional_user
    from database import User
    
    def override_get_current_user():
        return User(id="test_user_id", email="test@example.com", hashed_password="test", is_active=True)
    
    # Mock both auth dependencies so endpoints using get_optional_user
    # also run as authenticated user during tests
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_optional_user] = override_get_current_user

    with TestClient(app) as c:
        yield c
