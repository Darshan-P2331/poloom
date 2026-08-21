"""
REST API routes for pipeline CRUD and execution.
"""

from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.models.pipeline import (
    AggFunction,
    ExtractSource,
    LoadSink,
    PipelineConfig,
    PipelineListItem,
    PipelineRunResult,
    StageType,
    StageTypeInfo,
    TransformOperation,
)
from app.engine.executor import execute_pipeline
from app.services import pipeline_store

router = APIRouter(prefix="/api", tags=["pipelines"])


# ---------------------------------------------------------------------------
# Stage type catalog (for frontend palette)
# ---------------------------------------------------------------------------

STAGE_CATALOG: list[StageTypeInfo] = [
    # Extract sources
    StageTypeInfo(
        type=StageType.EXTRACT, category="extract", name="CSV Source",
        description="Read data from a CSV file",
        icon="file-spreadsheet",
        config_schema={
            "path": {"type": "string", "required": True, "label": "File Path"},
            "separator": {"type": "string", "default": ",", "label": "Separator"},
            "has_header": {"type": "boolean", "default": True, "label": "Has Header"},
        },
    ),
    StageTypeInfo(
        type=StageType.EXTRACT, category="extract", name="JSON Source",
        description="Read data from a JSON file",
        icon="file-json",
        config_schema={
            "path": {"type": "string", "required": True, "label": "File Path"},
        },
    ),
    StageTypeInfo(
        type=StageType.EXTRACT, category="extract", name="Parquet Source",
        description="Read data from a Parquet file",
        icon="database",
        config_schema={
            "path": {"type": "string", "required": True, "label": "File Path"},
        },
    ),
    # Transform operations
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Filter",
        description="Filter rows based on conditions",
        icon="filter",
        config_schema={
            "conditions": {"type": "array", "label": "Conditions", "items": {
                "field": {"type": "string"}, "operator": {"type": "string"}, "value": {"type": "any"},
            }},
            "logic": {"type": "string", "default": "and", "options": ["and", "or"]},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Select",
        description="Select specific columns",
        icon="columns-3",
        config_schema={
            "columns": {"type": "array", "items": {"type": "string"}, "label": "Columns"},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Group By",
        description="Group by columns and aggregate",
        icon="group",
        config_schema={
            "group_by": {"type": "array", "items": {"type": "string"}, "label": "Group By Columns"},
            "aggregations": {"type": "array", "label": "Aggregations", "items": {
                "column": {"type": "string"}, "function": {"type": "string"}, "alias": {"type": "string"},
            }},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Sort",
        description="Sort rows by columns",
        icon="arrow-up-down",
        config_schema={
            "by": {"type": "array", "items": {"type": "string"}, "label": "Sort Columns"},
            "descending": {"type": "boolean", "default": False, "label": "Descending"},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Rename",
        description="Rename columns",
        icon="pencil",
        config_schema={
            "mapping": {"type": "object", "label": "Column Mapping (old → new)"},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Cast",
        description="Cast columns to different data types",
        icon="shuffle",
        config_schema={
            "mapping": {"type": "object", "label": "Column → Type Mapping"},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Derive",
        description="Add computed columns",
        icon="calculator",
        config_schema={
            "columns": {"type": "object", "label": "New Columns (alias → expression)"},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Drop Nulls",
        description="Remove rows with null values",
        icon="trash-2",
        config_schema={
            "subset": {"type": "array", "items": {"type": "string"}, "label": "Column Subset (optional)"},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Unique",
        description="Keep unique rows",
        icon="fingerprint",
        config_schema={
            "subset": {"type": "array", "items": {"type": "string"}, "label": "Column Subset (optional)"},
            "keep": {"type": "string", "default": "first", "options": ["first", "last", "any", "none"]},
        },
    ),
    StageTypeInfo(
        type=StageType.TRANSFORM, category="transform", name="Join",
        description="Join with another data source",
        icon="merge",
        config_schema={
            "right_stage": {"type": "string", "required": True, "label": "Right Stage ID"},
            "on": {"type": "array", "items": {"type": "string"}, "label": "Join Columns"},
            "how": {"type": "string", "default": "inner", "options": ["inner", "left", "right", "outer", "cross"]},
        },
    ),
    # Load sinks
    StageTypeInfo(
        type=StageType.LOAD, category="load", name="CSV Output",
        description="Write data to a CSV file",
        icon="file-output",
        config_schema={
            "path": {"type": "string", "required": True, "label": "Output Path"},
            "separator": {"type": "string", "default": ",", "label": "Separator"},
        },
    ),
    StageTypeInfo(
        type=StageType.LOAD, category="load", name="JSON Output",
        description="Write data to a JSON file",
        icon="file-json-2",
        config_schema={
            "path": {"type": "string", "required": True, "label": "Output Path"},
        },
    ),
    StageTypeInfo(
        type=StageType.LOAD, category="load", name="Parquet Output",
        description="Write data to a Parquet file",
        icon="hard-drive",
        config_schema={
            "path": {"type": "string", "required": True, "label": "Output Path"},
            "compression": {"type": "string", "default": "snappy", "options": ["snappy", "gzip", "lz4", "zstd", "none"]},
        },
    ),
]


@router.get("/stage-types")
async def get_stage_types() -> list[StageTypeInfo]:
    """Retrieve metadata and parameter configuration schemas for all available stage types.

    Used by frontend editors and visual workflow canvases to populate the stage palette.

    Returns:
        list[StageTypeInfo]: List of available stage types with category, name, icon, and schema.
    """
    return STAGE_CATALOG


# ---------------------------------------------------------------------------
# Pipeline CRUD
# ---------------------------------------------------------------------------

@router.get("/pipelines")
async def list_pipelines() -> list[PipelineListItem]:
    """List all saved pipelines including stage counts and latest execution status.

    Returns:
        list[PipelineListItem]: Summaries of all pipelines stored in the database.
    """
    return await pipeline_store.list_pipelines()


@router.get("/pipelines/{pipeline_id}")
async def get_pipeline(pipeline_id: str) -> dict[str, Any]:
    """Retrieve full configuration and raw YAML for a specific pipeline.

    Args:
        pipeline_id (str): The unique identifier of the pipeline.

    Returns:
        dict[str, Any]: Dictionary containing pipeline ID, name, description, YAML config,
            stage count, and timestamps.

    Raises:
        HTTPException: 404 error if the pipeline ID does not exist.
    """
    data = await pipeline_store.get_pipeline(pipeline_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {
        "id": data["id"],
        "name": data["name"],
        "description": data["description"],
        "yaml_config": data["yaml_config"],
        "stage_count": data["stage_count"],
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


@router.post("/pipelines")
async def create_pipeline(body: dict[str, Any]) -> dict[str, str]:
    """Create and persist a new pipeline configuration.

    Accepts either a JSON object matching PipelineConfig or a payload containing a 'yaml_config' string.

    Args:
        body (dict[str, Any]): Request payload containing either full pipeline JSON or raw YAML string.

    Returns:
        dict[str, str]: Dictionary containing the newly created pipeline's unique 'id' and success message.

    Raises:
        HTTPException: 422 error if the YAML syntax or pipeline schema validation fails.
    """
    try:
        if "yaml_config" in body:
            # Parse from YAML string
            parsed = yaml.safe_load(body["yaml_config"])
            config = PipelineConfig(**parsed)
        else:
            config = PipelineConfig(**body)
    except (yaml.YAMLError, ValidationError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid pipeline config: {e}")

    pipeline_id = await pipeline_store.save_pipeline(config)
    return {"id": pipeline_id, "message": "Pipeline created successfully"}


@router.put("/pipelines/{pipeline_id}")
async def update_pipeline(pipeline_id: str, body: dict[str, Any]) -> dict[str, str]:
    """Update an existing pipeline configuration.

    Args:
        pipeline_id (str): The unique identifier of the pipeline to update.
        body (dict[str, Any]): Request payload containing either updated pipeline JSON or raw YAML string.

    Returns:
        dict[str, str]: Dictionary containing the pipeline 'id' and success message.

    Raises:
        HTTPException: 404 error if the pipeline is not found, or 422 if validation fails.
    """
    existing = await pipeline_store.get_pipeline(pipeline_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    try:
        if "yaml_config" in body:
            parsed = yaml.safe_load(body["yaml_config"])
            config = PipelineConfig(**parsed)
        else:
            config = PipelineConfig(**body)
    except (yaml.YAMLError, ValidationError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid pipeline config: {e}")

    await pipeline_store.save_pipeline(config, pipeline_id=pipeline_id)
    return {"id": pipeline_id, "message": "Pipeline updated successfully"}


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(pipeline_id: str) -> dict[str, str]:
    """Delete a pipeline and its associated files from the database and filesystem.

    Args:
        pipeline_id (str): The unique identifier of the pipeline to delete.

    Returns:
        dict[str, str]: Success confirmation message.

    Raises:
        HTTPException: 404 error if the pipeline is not found.
    """
    deleted = await pipeline_store.delete_pipeline(pipeline_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"message": "Pipeline deleted successfully"}


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

@router.post("/pipelines/{pipeline_id}/run")
async def run_pipeline(pipeline_id: str) -> PipelineRunResult:
    """Execute a pipeline DAG and log run results to execution history.

    Args:
        pipeline_id (str): The unique identifier of the pipeline to execute.

    Returns:
        PipelineRunResult: Detailed execution metrics including total runtime, status,
            and per-stage durations and row counts.

    Raises:
        HTTPException: 404 error if the pipeline is not found.
    """
    config = await pipeline_store.get_pipeline_config(pipeline_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    result = execute_pipeline(config)
    result.pipeline_id = pipeline_id

    # Save run to history
    await pipeline_store.save_run(result)

    return result


@router.get("/pipelines/{pipeline_id}/runs")
async def get_pipeline_runs(pipeline_id: str) -> list[dict[str, Any]]:
    """Retrieve execution history and performance breakdown for a given pipeline.

    Args:
        pipeline_id (str): The unique identifier of the pipeline.

    Returns:
        list[dict[str, Any]]: List of previous execution records for this pipeline.
    """
    return await pipeline_store.get_runs(pipeline_id)


# ---------------------------------------------------------------------------
# YAML validation
# ---------------------------------------------------------------------------

@router.post("/validate")
async def validate_yaml(body: dict[str, str]) -> dict[str, Any]:
    """Validate a raw YAML pipeline configuration string without saving to database.

    Args:
        body (dict[str, str]): Request payload containing a 'yaml_config' string.

    Returns:
        dict[str, Any]: Validation outcome dictionary containing 'valid' (bool),
            'pipeline_name' and 'stage_count' on success, or error details on failure.
    """
    yaml_str = body.get("yaml_config", "")
    try:
        parsed = yaml.safe_load(yaml_str)
        config = PipelineConfig(**parsed)
        return {
            "valid": True,
            "pipeline_name": config.pipeline.name,
            "stage_count": len(config.stages),
        }
    except yaml.YAMLError as e:
        return {"valid": False, "error": f"YAML parse error: {e}"}
    except ValidationError as e:
        return {"valid": False, "error": f"Validation error: {e}"}
