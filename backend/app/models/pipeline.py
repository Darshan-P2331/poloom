"""
Pydantic models for Poloom pipeline YAML configuration.

These models define the schema contract between the frontend editor
and the backend executor. They validate YAML configs at ingestion time.
"""

from __future__ import annotations

import enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class StageType(str, enum.Enum):
    EXTRACT = "extract"
    TRANSFORM = "transform"
    LOAD = "load"


class ExtractSource(str, enum.Enum):
    CSV = "csv"
    JSON = "json"
    PARQUET = "parquet"


class LoadSink(str, enum.Enum):
    CSV = "csv"
    JSON = "json"
    PARQUET = "parquet"


class TransformOperation(str, enum.Enum):
    FILTER = "filter"
    SELECT = "select"
    RENAME = "rename"
    GROUP_BY = "group_by"
    SORT = "sort"
    CAST = "cast"
    JOIN = "join"
    DERIVE = "derive"
    DROP_NULLS = "drop_nulls"
    UNIQUE = "unique"


class AggFunction(str, enum.Enum):
    SUM = "sum"
    MEAN = "mean"
    COUNT = "count"
    MIN = "min"
    MAX = "max"
    FIRST = "first"
    LAST = "last"


# ---------------------------------------------------------------------------
# Config sub-models
# ---------------------------------------------------------------------------

class AggregationSpec(BaseModel):
    """A single aggregation within a group_by stage."""
    column: str
    function: AggFunction
    alias: Optional[str] = None


class ExtractConfig(BaseModel):
    """Configuration for extract stages."""
    path: str
    separator: str = ","
    has_header: bool = True
    dtypes: Optional[dict[str, str]] = None
    n_rows: Optional[int] = None


class FilterCondition(BaseModel):
    """A single filter condition."""
    field: str
    operator: Literal["eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in", "is_null", "is_not_null", "contains", "starts_with", "ends_with"]
    value: Any = None


class FilterConfig(BaseModel):
    """Configuration for filter transform."""
    conditions: list[FilterCondition]
    logic: Literal["and", "or"] = "and"


class SelectConfig(BaseModel):
    """Configuration for select transform."""
    columns: list[str]


class RenameConfig(BaseModel):
    """Configuration for rename transform."""
    mapping: dict[str, str]


class GroupByConfig(BaseModel):
    """Configuration for group_by transform."""
    group_by: list[str]
    aggregations: list[AggregationSpec]


class SortConfig(BaseModel):
    """Configuration for sort transform."""
    by: list[str]
    descending: list[bool] | bool = False


class CastConfig(BaseModel):
    """Configuration for cast transform."""
    mapping: dict[str, str]  # column -> target dtype


class JoinConfig(BaseModel):
    """Configuration for join transform."""
    right_stage: str  # id of the other stage to join with
    on: list[str] | None = None
    left_on: list[str] | None = None
    right_on: list[str] | None = None
    how: Literal["inner", "left", "right", "outer", "cross"] = "inner"


class DeriveConfig(BaseModel):
    """Configuration for derive (add column) transform."""
    columns: dict[str, str]  # alias -> expression string


class DropNullsConfig(BaseModel):
    """Configuration for drop_nulls transform."""
    subset: list[str] | None = None


class UniqueConfig(BaseModel):
    """Configuration for unique transform."""
    subset: list[str] | None = None
    keep: Literal["first", "last", "any", "none"] = "first"


class LoadConfig(BaseModel):
    """Configuration for load stages."""
    path: str
    separator: str = ","
    compression: Optional[Literal["snappy", "gzip", "lz4", "zstd", "none"]] = None


# ---------------------------------------------------------------------------
# Stage model
# ---------------------------------------------------------------------------

class StageConfig(BaseModel):
    """A single stage in the ETL pipeline."""
    id: str = Field(..., pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    type: StageType
    depends_on: list[str] = Field(default_factory=list)

    # Extract fields
    source: Optional[ExtractSource] = None
    extract_config: Optional[ExtractConfig] = None

    # Transform fields
    operation: Optional[TransformOperation] = None
    transform_config: Optional[dict[str, Any]] = None

    # Load fields
    sink: Optional[LoadSink] = None
    load_config: Optional[LoadConfig] = None

    # UI metadata (positions for React Flow)
    position: Optional[dict[str, float]] = None
    label: Optional[str] = None


# ---------------------------------------------------------------------------
# Pipeline model
# ---------------------------------------------------------------------------

class PipelineMetadata(BaseModel):
    """Top-level pipeline metadata."""
    name: str
    description: str = ""
    version: str = "1.0"
    variables: dict[str, Any] = Field(default_factory=dict)


class PipelineConfig(BaseModel):
    """Complete pipeline configuration — maps directly to a YAML file."""
    pipeline: PipelineMetadata
    stages: list[StageConfig]


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------

class StageResult(BaseModel):
    """Result of executing a single stage."""
    stage_id: str
    status: Literal["success", "error", "skipped"]
    rows_affected: int = 0
    duration_ms: float = 0.0
    error: Optional[str] = None


class PipelineRunResult(BaseModel):
    """Result of a full pipeline execution."""
    pipeline_id: str
    pipeline_name: str
    status: Literal["success", "error", "partial"]
    total_duration_ms: float = 0.0
    stage_results: list[StageResult] = Field(default_factory=list)
    error: Optional[str] = None


class PipelineListItem(BaseModel):
    """Summary of a pipeline for listing."""
    id: str
    name: str
    description: str = ""
    stage_count: int = 0
    last_run_status: Optional[str] = None
    last_run_at: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class StageTypeInfo(BaseModel):
    """Info about a stage type for the frontend palette."""
    type: StageType
    category: str
    name: str
    description: str
    icon: str
    config_schema: dict[str, Any] = Field(default_factory=dict)
