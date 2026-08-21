"""
Pipeline executor — orchestrates the full ETL pipeline.

1. Parses stages from a PipelineConfig
2. Builds a DAG from depends_on relationships
3. Topologically sorts to determine execution order
4. Executes each stage, passing LazyFrames between them
5. Collects results and timing for each stage
"""

import time
from collections import defaultdict
from typing import Any

import polars as pl

from app.models.pipeline import (
    ExtractConfig,
    JoinConfig,
    LoadConfig,
    PipelineConfig,
    PipelineRunResult,
    StageConfig,
    StageResult,
    StageType,
    TransformOperation,
)
from app.engine.extractors import run_extract
from app.engine.transformers import run_transform
from app.engine.loaders import run_load


def _topological_sort(stages: list[StageConfig]) -> list[StageConfig]:
    """Sort pipeline stages in topological dependency order using Kahn's algorithm.

    Validates that all stage dependencies exist and that there are no circular dependencies.

    Args:
        stages (list[StageConfig]): The list of stage configurations to sort.

    Returns:
        list[StageConfig]: Stages ordered such that each stage appears after all its dependencies.

    Raises:
        ValueError: If a stage depends on an unknown stage ID or if a cycle is detected.
    """
    stage_map = {s.id: s for s in stages}
    in_degree: dict[str, int] = {s.id: 0 for s in stages}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for stage in stages:
        for dep in stage.depends_on:
            if dep not in stage_map:
                raise ValueError(
                    f"Stage '{stage.id}' depends on unknown stage '{dep}'"
                )
            adjacency[dep].append(stage.id)
            in_degree[stage.id] += 1

    # Start with stages that have no dependencies
    queue = [sid for sid, deg in in_degree.items() if deg == 0]
    sorted_ids: list[str] = []

    while queue:
        # Sort for determinism
        queue.sort()
        current = queue.pop(0)
        sorted_ids.append(current)

        for neighbor in adjacency[current]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(sorted_ids) != len(stages):
        raise ValueError("Pipeline contains a cycle in stage dependencies!")

    return [stage_map[sid] for sid in sorted_ids]


import re

def _substitute_variables(obj: Any, variables: dict[str, Any]) -> Any:
    """Recursively substitute ${var_name} patterns in stage configs with variable values.

    Args:
        obj (Any): Target object (dict, list, string, or primitive).
        variables (dict[str, Any]): Dictionary of variable names and their values.

    Returns:
        Any: Object with variable references resolved.
    """
    if not variables:
        return obj

    if isinstance(obj, str):
        # Exact match: ${var_name} -> preserves original type (int, float, bool, etc.)
        exact_match = re.fullmatch(r"\$\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}", obj)
        if exact_match:
            var_name = exact_match.group(1)
            if var_name in variables:
                return variables[var_name]

        # Partial substring replacement: e.g. "path/to/${region}_data.csv"
        def _repl(m: re.Match) -> str:
            vname = m.group(1)
            return str(variables.get(vname, m.group(0)))

        return re.sub(r"\$\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}", _repl, obj)

    elif isinstance(obj, dict):
        return {k: _substitute_variables(v, variables) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_substitute_variables(item, variables) for item in obj]
    return obj


def _execute_stage(
    stage: StageConfig,
    stage_outputs: dict[str, pl.LazyFrame],
    variables: dict[str, Any] | None = None,
) -> tuple[pl.LazyFrame | None, int]:
    """Execute a single pipeline stage within the DAG execution flow.

    Extract and transform stages return an intermediate LazyFrame (row count = 0),
    while load stages collect and materialize data to disk, returning the total rows written.

    Args:
        stage (StageConfig): The configuration of the stage to execute.
        stage_outputs (dict[str, pl.LazyFrame]): A mapping of previously executed stage IDs
            to their output LazyFrames.
        variables (dict[str, Any] | None): Optional pipeline variables for parameter substitution.

    Returns:
        tuple[pl.LazyFrame | None, int]: A tuple containing the output LazyFrame (or None for load stages)
            and the number of affected/written rows.

    Raises:
        ValueError: If required stage configuration is missing, upstream stage outputs are absent,
            or an unknown stage type is encountered.
    """
    vars_dict = variables or {}

    if stage.type == StageType.EXTRACT:
        if stage.source is None:
            raise ValueError(f"Extract stage '{stage.id}' missing 'source'")
        raw_cfg = stage.extract_config.model_dump() if stage.extract_config else {}
        interpolated = _substitute_variables(raw_cfg, vars_dict)
        config = ExtractConfig(**interpolated)
        lf = run_extract(stage.source, config)
        return lf, 0

    elif stage.type == StageType.TRANSFORM:
        if stage.operation is None:
            raise ValueError(f"Transform stage '{stage.id}' missing 'operation'")
        if not stage.depends_on:
            raise ValueError(f"Transform stage '{stage.id}' has no depends_on")

        # Get primary input
        primary_dep = stage.depends_on[0]
        if primary_dep not in stage_outputs:
            raise ValueError(
                f"Stage '{stage.id}' depends on '{primary_dep}' which has no output"
            )
        lf = stage_outputs[primary_dep]

        raw_cfg = stage.transform_config or {}
        config = _substitute_variables(raw_cfg, vars_dict)

        # Handle join specially — needs a right LazyFrame
        if stage.operation == TransformOperation.JOIN:
            join_cfg = JoinConfig(**config)
            right_id = join_cfg.right_stage
            if right_id not in stage_outputs:
                raise ValueError(
                    f"Join stage '{stage.id}' references unknown right_stage '{right_id}'"
                )
            right_lf = stage_outputs[right_id]
            lf = run_transform(stage.operation, lf, config, right_lf=right_lf)
        else:
            lf = run_transform(stage.operation, lf, config)

        return lf, 0

    elif stage.type == StageType.LOAD:
        if stage.sink is None:
            raise ValueError(f"Load stage '{stage.id}' missing 'sink'")
        if not stage.depends_on:
            raise ValueError(f"Load stage '{stage.id}' has no depends_on")

        primary_dep = stage.depends_on[0]
        if primary_dep not in stage_outputs:
            raise ValueError(
                f"Stage '{stage.id}' depends on '{primary_dep}' which has no output"
            )
        lf = stage_outputs[primary_dep]

        raw_cfg = stage.load_config.model_dump() if stage.load_config else {}
        interpolated = _substitute_variables(raw_cfg, vars_dict)
        config = LoadConfig(**interpolated)
        row_count = run_load(stage.sink, lf, config)
        return None, row_count

    else:
        raise ValueError(f"Unknown stage type: {stage.type}")


def execute_pipeline(config: PipelineConfig) -> PipelineRunResult:
    """Execute a complete ETL pipeline DAG based on its configuration.

    Sorts stages topologically, chains LazyFrames sequentially according to dependencies,
    executes materialization sinks, and records per-stage execution times, row counts, and statuses.

    Args:
        config (PipelineConfig): The parsed pipeline configuration containing metadata and stages.

    Returns:
        PipelineRunResult: Result object summarizing execution status ('success', 'error', 'partial'),
            total duration in ms, per-stage results, and any error message.
    """
    total_start = time.perf_counter()
    stage_results: list[StageResult] = []
    stage_outputs: dict[str, pl.LazyFrame] = {}
    pipeline_status = "success"
    pipeline_error = None
    variables = config.pipeline.variables or {}

    # Topologically sort stages
    try:
        sorted_stages = _topological_sort(config.stages)
    except ValueError as e:
        return PipelineRunResult(
            pipeline_id="",
            pipeline_name=config.pipeline.name,
            status="error",
            error=str(e),
            total_duration_ms=(time.perf_counter() - total_start) * 1000,
        )

    # Execute each stage in order
    for stage in sorted_stages:
        stage_start = time.perf_counter()
        try:
            output, row_count = _execute_stage(stage, stage_outputs, variables=variables)

            if output is not None:
                stage_outputs[stage.id] = output
                # For non-load stages, we can estimate rows by collecting schema
                # but avoid full collection. We'll report 0 rows for lazy stages.

            stage_duration = (time.perf_counter() - stage_start) * 1000
            stage_results.append(StageResult(
                stage_id=stage.id,
                status="success",
                rows_affected=row_count,
                duration_ms=round(stage_duration, 2),
            ))

        except Exception as e:
            stage_duration = (time.perf_counter() - stage_start) * 1000
            stage_results.append(StageResult(
                stage_id=stage.id,
                status="error",
                duration_ms=round(stage_duration, 2),
                error=str(e),
            ))
            pipeline_status = "partial"
            pipeline_error = f"Stage '{stage.id}' failed: {e}"
            # Skip downstream stages
            break

    total_duration = (time.perf_counter() - total_start) * 1000

    # If we broke out early, mark remaining stages as skipped
    executed_ids = {r.stage_id for r in stage_results}
    for stage in sorted_stages:
        if stage.id not in executed_ids:
            stage_results.append(StageResult(
                stage_id=stage.id,
                status="skipped",
            ))

    if pipeline_status == "partial" and all(r.status == "error" for r in stage_results if r.status != "skipped"):
        pipeline_status = "error"

    return PipelineRunResult(
        pipeline_id="",
        pipeline_name=config.pipeline.name,
        status=pipeline_status,
        total_duration_ms=round(total_duration, 2),
        stage_results=stage_results,
        error=pipeline_error,
    )
