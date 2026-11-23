"""
Database session management. The rest of the codebase never imports
sqlite3 or psycopg2 directly — it depends on SQLAlchemy's Session, so
moving from local SQLite to a hosted Postgres database is purely a
DATABASE_URL change (see app/config.py), not a code change.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import get_settings

settings = get_settings()

# SQLite needs this connect_arg for multi-threaded FastAPI access; Postgres
# and other real databases ignore it, so it's safe to always pass.
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

# WAL mode dramatically improves concurrent read/write throughput on
# SQLite specifically — irrelevant (and skipped) once DATABASE_URL points
# at Postgres.
if settings.DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a session, always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
