"""
Pipeline storage service — CRUD operations backed by SQLite + YAML files.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

from app.models.pipeline import (
    PipelineConfig,
    PipelineListItem,
    PipelineRunResult,
    StageResult,
)
from app.services.database import get_db

PIPELINES_DIR = Path("./pipelines")


def _ensure_dir() -> None:
    """Ensure that the local directory for saving YAML pipeline files exists."""
    PIPELINES_DIR.mkdir(parents=True, exist_ok=True)


def _generate_id() -> str:
    """Generate a unique 12-character hexadecimal identifier.

    Returns:
        str: A 12-character unique ID string.
    """
    return uuid.uuid4().hex[:12]


def _now_iso() -> str:
    """Return the current UTC timestamp formatted as an ISO-8601 string.

    Returns:
        str: Current UTC ISO-8601 formatted datetime string.
    """
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Pipeline CRUD
# ---------------------------------------------------------------------------

async def list_pipelines() -> list[PipelineListItem]:
    """Retrieve all saved pipelines from the database alongside their latest execution run status.

    Returns:
        list[PipelineListItem]: A list of pipeline summary objects containing ID, name, description,
            stage count, timestamps, and most recent run status.
    """
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT
                p.id, p.name, p.description, p.stage_count,
                p.created_at, p.updated_at,
                r.status as last_run_status,
                r.started_at as last_run_at
            FROM pipelines p
            LEFT JOIN (
                SELECT pipeline_id, status, started_at,
                       ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY started_at DESC) as rn
                FROM pipeline_runs
            ) r ON r.pipeline_id = p.id AND r.rn = 1
            ORDER BY p.updated_at DESC
        """)
        rows = await cursor.fetchall()
        return [
            PipelineListItem(
                id=row["id"],
                name=row["name"],
                description=row["description"] or "",
                stage_count=row["stage_count"] or 0,
                last_run_status=row["last_run_status"],
                last_run_at=row["last_run_at"],
                created_at=row["created_at"] or "",
                updated_at=row["updated_at"] or "",
            )
            for row in rows
        ]
    finally:
        await db.close()


async def get_pipeline(pipeline_id: str) -> Optional[dict]:
    """Fetch raw pipeline metadata and YAML configuration for a given pipeline ID.

    Args:
        pipeline_id (str): The unique identifier of the pipeline.

    Returns:
        Optional[dict]: A dictionary of the pipeline table row if found, or None if not found.
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM pipelines WHERE id = ?", (pipeline_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return dict(row)
    finally:
        await db.close()


async def get_pipeline_config(pipeline_id: str) -> Optional[PipelineConfig]:
    """Fetch and parse a pipeline's YAML configuration into a validated PipelineConfig object.

    Args:
        pipeline_id (str): The unique identifier of the pipeline.

    Returns:
        Optional[PipelineConfig]: The parsed Pydantic PipelineConfig if found, otherwise None.
    """
    data = await get_pipeline(pipeline_id)
    if data is None:
        return None
    return PipelineConfig(**yaml.safe_load(data["yaml_config"]))


async def save_pipeline(config: PipelineConfig, pipeline_id: Optional[str] = None) -> str:
    """Save or update a pipeline configuration in both SQLite and a disk YAML file.

    Args:
        config (PipelineConfig): The pipeline configuration to persist.
        pipeline_id (Optional[str]): The pipeline ID to update, or None to generate a new ID.

    Returns:
        str: The persisted pipeline's unique ID.
    """
    _ensure_dir()
    yaml_str = yaml.dump(
        config.model_dump(exclude_none=True),
        default_flow_style=False,
        sort_keys=False,
    )

    if pipeline_id is None:
        pipeline_id = _generate_id()

    now = _now_iso()
    db = await get_db()
    try:
        # Upsert
        await db.execute(
            """
            INSERT INTO pipelines (id, name, description, yaml_config, stage_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                yaml_config = excluded.yaml_config,
                stage_count = excluded.stage_count,
                updated_at = excluded.updated_at
            """,
            (
                pipeline_id,
                config.pipeline.name,
                config.pipeline.description,
                yaml_str,
                len(config.stages),
                now,
                now,
            ),
        )
        await db.commit()
    finally:
        await db.close()

    # Also save YAML file to disk for transparency
    yaml_path = PIPELINES_DIR / f"{pipeline_id}.yaml"
    yaml_path.write_text(yaml_str, encoding="utf-8")

    return pipeline_id


async def delete_pipeline(pipeline_id: str) -> bool:
    """Delete a pipeline and its stored YAML file from disk and database.

    Args:
        pipeline_id (str): The unique identifier of the pipeline to remove.

    Returns:
        bool: True if the pipeline was found and deleted, False otherwise.
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "DELETE FROM pipelines WHERE id = ?", (pipeline_id,)
        )
        await db.commit()
        deleted = cursor.rowcount > 0
    finally:
        await db.close()

    # Also remove YAML file
    yaml_path = PIPELINES_DIR / f"{pipeline_id}.yaml"
    if yaml_path.exists():
        yaml_path.unlink()

    return deleted


# ---------------------------------------------------------------------------
# Run history
# ---------------------------------------------------------------------------

async def save_run(result: PipelineRunResult) -> str:
    """Persist a completed or failed pipeline execution run to the database.

    Args:
        result (PipelineRunResult): The execution result containing stage metrics and status.

    Returns:
        str: The generated run ID.
    """
    run_id = _generate_id()
    now = _now_iso()
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO pipeline_runs (id, pipeline_id, status, stage_results, total_duration_ms, error, started_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                result.pipeline_id,
                result.status,
                json.dumps([sr.model_dump() for sr in result.stage_results]),
                result.total_duration_ms,
                result.error,
                now,
                now,
            ),
        )
        await db.commit()
    finally:
        await db.close()
    return run_id


async def get_runs(pipeline_id: str, limit: int = 20) -> list[dict]:
    """Retrieve execution run history for a given pipeline ordered from newest to oldest.

    Args:
        pipeline_id (str): The unique pipeline ID.
        limit (int): Maximum number of run history records to return. Defaults to 20.

    Returns:
        list[dict]: A list of historical run records including deserialized stage results.
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT id, pipeline_id, status, stage_results, total_duration_ms, error, started_at, completed_at
            FROM pipeline_runs
            WHERE pipeline_id = ?
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (pipeline_id, limit),
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["stage_results"] = json.loads(d["stage_results"]) if d["stage_results"] else []
            results.append(d)
        return results
    finally:
        await db.close()
