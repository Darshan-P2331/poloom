"""
SQLite database setup for pipeline metadata and run history.
Uses aiosqlite for async operations with FastAPI.
"""

import os
from pathlib import Path

import aiosqlite

DB_PATH = os.environ.get("POLOOM_DB_PATH", "./data/poloom.db")


async def get_db() -> aiosqlite.Connection:
    """Establish and configure an asynchronous SQLite database connection.

    Ensures the parent directory exists, sets row_factory to Row for dict-like access,
    and enables WAL mode and foreign key constraints.

    Returns:
        aiosqlite.Connection: An open, configured asynchronous SQLite connection.
    """
    db_path = Path(DB_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(db_path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    """Initialize SQLite database tables and indices for pipelines and run history.

    Creates the `pipelines` and `pipeline_runs` tables along with appropriate indices
    if they do not already exist.
    """
    db = await get_db()
    try:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS pipelines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                yaml_config TEXT NOT NULL,
                stage_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                stage_results TEXT DEFAULT '[]',
                total_duration_ms REAL DEFAULT 0.0,
                error TEXT,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at TEXT,
                FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_runs_pipeline_id
                ON pipeline_runs(pipeline_id);

            CREATE INDEX IF NOT EXISTS idx_runs_started_at
                ON pipeline_runs(started_at DESC);
        """)
        await db.commit()
    finally:
        await db.close()
