"""
Backend tests for the Poloom ETL engine and API.
"""

from pathlib import Path
import pytest
from app.models.pipeline import (
    ExtractConfig,
    ExtractSource,
    FilterCondition,
    FilterConfig,
    GroupByConfig,
    AggregationSpec,
    AggFunction,
    LoadConfig,
    LoadSink,
    PipelineConfig,
    PipelineMetadata,
    StageConfig,
    StageType,
    TransformOperation,
)
from app.engine.executor import execute_pipeline, _topological_sort


def test_topological_sort():
    """Verify that stage dependencies are sorted in correct DAG order."""
    stages = [
        StageConfig(id="stage3", type=StageType.LOAD, depends_on=["stage2"], sink=LoadSink.CSV, load_config=LoadConfig(path="out.csv")),
        StageConfig(id="stage1", type=StageType.EXTRACT, source=ExtractSource.CSV, extract_config=ExtractConfig(path="in.csv")),
        StageConfig(id="stage2", type=StageType.TRANSFORM, depends_on=["stage1"], operation=TransformOperation.FILTER),
    ]

    sorted_stages = _topological_sort(stages)
    assert [s.id for s in sorted_stages] == ["stage1", "stage2", "stage3"]


def test_cycle_detection():
    """Verify that circular dependencies raise ValueError."""
    stages = [
        StageConfig(id="stage1", type=StageType.TRANSFORM, depends_on=["stage2"], operation=TransformOperation.FILTER),
        StageConfig(id="stage2", type=StageType.TRANSFORM, depends_on=["stage1"], operation=TransformOperation.FILTER),
    ]

    with pytest.raises(ValueError, match="cycle"):
        _topological_sort(stages)


def test_end_to_end_pipeline_execution(tmp_path: Path):
    """Verify full ETL pipeline execution with sample customer data."""
    sample_csv = Path(__file__).parent.parent / "sample_data" / "customers.csv"
    output_csv = tmp_path / "output_summary.csv"

    pipeline = PipelineConfig(
        pipeline=PipelineMetadata(
            name="test_customer_flow",
            description="Filter active and aggregate revenue by region",
        ),
        stages=[
            StageConfig(
                id="extract_cust",
                type=StageType.EXTRACT,
                source=ExtractSource.CSV,
                extract_config=ExtractConfig(path=str(sample_csv)),
            ),
            StageConfig(
                id="filter_active",
                type=StageType.TRANSFORM,
                operation=TransformOperation.FILTER,
                depends_on=["extract_cust"],
                transform_config={
                    "logic": "and",
                    "conditions": [
                        {"field": "status", "operator": "eq", "value": "active"}
                    ],
                },
            ),
            StageConfig(
                id="agg_region",
                type=StageType.TRANSFORM,
                operation=TransformOperation.GROUP_BY,
                depends_on=["filter_active"],
                transform_config={
                    "group_by": ["region"],
                    "aggregations": [
                        {"column": "revenue", "function": "sum", "alias": "total_revenue"},
                        {"column": "id", "function": "count", "alias": "cust_count"},
                    ],
                },
            ),
            StageConfig(
                id="save_output",
                type=StageType.LOAD,
                sink=LoadSink.CSV,
                depends_on=["agg_region"],
                load_config=LoadConfig(path=str(output_csv)),
            ),
        ],
    )

    result = execute_pipeline(pipeline)
    assert result.status == "success"
    assert result.error is None
    assert len(result.stage_results) == 4
    assert result.stage_results[-1].rows_affected > 0
    assert output_csv.exists()


def test_variable_interpolation(tmp_path: Path):
    """Verify that variables are substituted into stage configs at runtime."""
    sample_csv = Path(__file__).parent.parent / "sample_data" / "customers.csv"
    output_csv = tmp_path / "out_${target_region}.csv"

    pipeline = PipelineConfig(
        pipeline=PipelineMetadata(
            name="test_vars_flow",
            variables={
                "target_region": "North",
                "active_status": "active",
            },
        ),
        stages=[
            StageConfig(
                id="extract_cust",
                type=StageType.EXTRACT,
                source=ExtractSource.CSV,
                extract_config=ExtractConfig(path=str(sample_csv)),
            ),
            StageConfig(
                id="filter_cust",
                type=StageType.TRANSFORM,
                operation=TransformOperation.FILTER,
                depends_on=["extract_cust"],
                transform_config={
                    "logic": "and",
                    "conditions": [
                        {"field": "region", "operator": "eq", "value": "${target_region}"},
                        {"field": "status", "operator": "eq", "value": "${active_status}"},
                    ],
                },
            ),
            StageConfig(
                id="save_output",
                type=StageType.LOAD,
                sink=LoadSink.CSV,
                depends_on=["filter_cust"],
                load_config=LoadConfig(path=str(output_csv)),
            ),
        ],
    )

    result = execute_pipeline(pipeline)
    assert result.status == "success"
    assert (tmp_path / "out_North.csv").exists()
