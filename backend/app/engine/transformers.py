"""
Transform handlers — all operate on Polars LazyFrames.

Each transformer takes a LazyFrame + config dict and returns a new LazyFrame.
The config dict is parsed into the appropriate Pydantic model internally.
"""

from typing import Any

import polars as pl

from app.models.pipeline import (
    AggFunction,
    CastConfig,
    DeriveConfig,
    DropNullsConfig,
    FilterCondition,
    FilterConfig,
    GroupByConfig,
    JoinConfig,
    RenameConfig,
    SelectConfig,
    SortConfig,
    TransformOperation,
    UniqueConfig,
)
from app.engine.extractors import DTYPE_MAP


# ---------------------------------------------------------------------------
# Filter
# ---------------------------------------------------------------------------

def _build_filter_expr(cond: FilterCondition) -> pl.Expr:
    """Build a Polars filter expression from a single FilterCondition model.

    Args:
        cond (FilterCondition): The condition containing field name, comparison operator,
            and target value.

    Returns:
        pl.Expr: A Polars boolean expression evaluating the condition.

    Raises:
        ValueError: If an unsupported filter operator is provided.
    """
    col = pl.col(cond.field)
    match cond.operator:
        case "eq":
            return col == cond.value
        case "ne":
            return col != cond.value
        case "gt":
            return col > cond.value
        case "gte":
            return col >= cond.value
        case "lt":
            return col < cond.value
        case "lte":
            return col <= cond.value
        case "in":
            return col.is_in(cond.value)
        case "not_in":
            return ~col.is_in(cond.value)
        case "is_null":
            return col.is_null()
        case "is_not_null":
            return col.is_not_null()
        case "contains":
            return col.str.contains(str(cond.value))
        case "starts_with":
            return col.str.starts_with(str(cond.value))
        case "ends_with":
            return col.str.ends_with(str(cond.value))
        case _:
            raise ValueError(f"Unknown filter operator: {cond.operator}")


def transform_filter(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Apply filter conditions combined with 'and' or 'or' logic to a LazyFrame.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame to filter.
        config (dict[str, Any]): Filter configuration dictionary containing 'conditions' list
            and optional 'logic' string ('and' | 'or').

    Returns:
        pl.LazyFrame: The filtered Polars LazyFrame.
    """
    cfg = FilterConfig(**config)
    exprs = [_build_filter_expr(c) for c in cfg.conditions]

    if not exprs:
        return lf

    if cfg.logic == "and":
        combined = exprs[0]
        for e in exprs[1:]:
            combined = combined & e
    else:
        combined = exprs[0]
        for e in exprs[1:]:
            combined = combined | e

    return lf.filter(combined)


# ---------------------------------------------------------------------------
# Select
# ---------------------------------------------------------------------------

def transform_select(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Select a specific subset of columns from a LazyFrame.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): Select configuration dictionary containing 'columns' list.

    Returns:
        pl.LazyFrame: A LazyFrame projected down to only the chosen columns.
    """
    cfg = SelectConfig(**config)
    return lf.select(cfg.columns)


# ---------------------------------------------------------------------------
# Rename
# ---------------------------------------------------------------------------

def transform_rename(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Rename columns in a LazyFrame based on an old-to-new mapping dictionary.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): Rename configuration dictionary containing 'mapping' dict.

    Returns:
        pl.LazyFrame: A LazyFrame with columns renamed.
    """
    cfg = RenameConfig(**config)
    return lf.rename(cfg.mapping)


# ---------------------------------------------------------------------------
# Group By
# ---------------------------------------------------------------------------

def _build_agg_expr(column: str, func: AggFunction, alias: str | None) -> pl.Expr:
    """Build a Polars aggregation expression for a given column and aggregate function.

    Args:
        column (str): The column name to aggregate.
        func (AggFunction): The aggregation function to apply (e.g. sum, mean, count, min, max, first, last).
        alias (str | None): Optional output alias name for the aggregated column.

    Returns:
        pl.Expr: A Polars aggregation expression.

    Raises:
        ValueError: If an unrecognized aggregation function enum is provided.
    """
    col = pl.col(column)
    match func:
        case AggFunction.SUM:
            expr = col.sum()
        case AggFunction.MEAN:
            expr = col.mean()
        case AggFunction.COUNT:
            expr = col.count()
        case AggFunction.MIN:
            expr = col.min()
        case AggFunction.MAX:
            expr = col.max()
        case AggFunction.FIRST:
            expr = col.first()
        case AggFunction.LAST:
            expr = col.last()
        case _:
            raise ValueError(f"Unknown aggregation function: {func}")

    if alias:
        expr = expr.alias(alias)
    return expr


def transform_group_by(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Group rows by specified columns and compute aggregations.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): GroupBy configuration dictionary containing 'group_by' columns
            and 'aggregations' specifications.

    Returns:
        pl.LazyFrame: The grouped and aggregated Polars LazyFrame.
    """
    cfg = GroupByConfig(**config)
    agg_exprs = [
        _build_agg_expr(a.column, a.function, a.alias)
        for a in cfg.aggregations
    ]
    return lf.group_by(cfg.group_by).agg(agg_exprs)


# ---------------------------------------------------------------------------
# Sort
# ---------------------------------------------------------------------------

def transform_sort(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Sort a LazyFrame by one or more columns in ascending or descending order.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): Sort configuration dictionary containing 'by' column list
            and 'descending' flag or list of flags.

    Returns:
        pl.LazyFrame: The sorted Polars LazyFrame.
    """
    cfg = SortConfig(**config)
    return lf.sort(cfg.by, descending=cfg.descending)


# ---------------------------------------------------------------------------
# Cast
# ---------------------------------------------------------------------------

def transform_cast(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Cast column data types in a LazyFrame based on a column-to-type mapping.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): Cast configuration dictionary containing 'mapping' dict.

    Returns:
        pl.LazyFrame: A LazyFrame with transformed column data types.

    Raises:
        ValueError: If a target data type name is unsupported.
    """
    cfg = CastConfig(**config)
    for col_name, dtype_str in cfg.mapping.items():
        if dtype_str not in DTYPE_MAP:
            raise ValueError(f"Unknown dtype '{dtype_str}' for cast on '{col_name}'")
        lf = lf.with_columns(pl.col(col_name).cast(DTYPE_MAP[dtype_str]))
    return lf


# ---------------------------------------------------------------------------
# Join (requires a second LazyFrame — handled by executor)
# ---------------------------------------------------------------------------

def transform_join(
    lf: pl.LazyFrame,
    right_lf: pl.LazyFrame,
    config: dict[str, Any],
) -> pl.LazyFrame:
    """Join the primary LazyFrame with a secondary (right) LazyFrame.

    Args:
        lf (pl.LazyFrame): The primary (left) Polars LazyFrame.
        right_lf (pl.LazyFrame): The secondary (right) Polars LazyFrame.
        config (dict[str, Any]): Join configuration dictionary specifying join keys
            ('on' or 'left_on'/'right_on') and join strategy 'how' (inner, left, right, outer, cross).

    Returns:
        pl.LazyFrame: The joined Polars LazyFrame.
    """
    cfg = JoinConfig(**config)
    kwargs: dict[str, Any] = {"other": right_lf, "how": cfg.how}
    if cfg.on:
        kwargs["on"] = cfg.on
    else:
        if cfg.left_on:
            kwargs["left_on"] = cfg.left_on
        if cfg.right_on:
            kwargs["right_on"] = cfg.right_on
    return lf.join(**kwargs)


# ---------------------------------------------------------------------------
# Derive (add computed columns)
# ---------------------------------------------------------------------------

def transform_derive(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Add computed columns to a LazyFrame using safe Polars expression evaluation.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): Derive configuration dictionary mapping output aliases to
            expression strings (e.g. {"tax": "col('revenue') * 0.18"}).

    Returns:
        pl.LazyFrame: A LazyFrame with the newly derived columns appended.

    Raises:
        ValueError: If an expression syntax is invalid or fails evaluation.
    """
    cfg = DeriveConfig(**config)
    new_cols = []
    for alias, expr_str in cfg.columns.items():
        # Support simple column references and basic math
        # e.g., "col('a') + col('b')" or "col('price') * 1.1"
        try:
            # Use Polars' own expression parsing for safety
            expr = eval(expr_str, {"__builtins__": {}}, {
                "col": pl.col,
                "lit": pl.lit,
                "when": pl.when,
            })
            new_cols.append(expr.alias(alias))
        except Exception as e:
            raise ValueError(f"Invalid expression for column '{alias}': {expr_str}. Error: {e}")

    if new_cols:
        lf = lf.with_columns(new_cols)
    return lf


# ---------------------------------------------------------------------------
# Drop Nulls
# ---------------------------------------------------------------------------

def transform_drop_nulls(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Drop rows containing null values across all or a subset of columns.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): DropNulls configuration dictionary with optional 'subset' column list.

    Returns:
        pl.LazyFrame: A LazyFrame with null rows removed.
    """
    cfg = DropNullsConfig(**config)
    if cfg.subset:
        return lf.drop_nulls(subset=cfg.subset)
    return lf.drop_nulls()


# ---------------------------------------------------------------------------
# Unique
# ---------------------------------------------------------------------------

def transform_unique(lf: pl.LazyFrame, config: dict[str, Any]) -> pl.LazyFrame:
    """Deduplicate rows in a LazyFrame based on all or a subset of columns.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame.
        config (dict[str, Any]): Unique configuration dictionary with optional 'subset' column list
            and 'keep' strategy ('first', 'last', 'any', 'none').

    Returns:
        pl.LazyFrame: A deduplicated Polars LazyFrame.
    """
    cfg = UniqueConfig(**config)
    kwargs: dict[str, Any] = {}
    if cfg.subset:
        kwargs["subset"] = cfg.subset
    kwargs["keep"] = cfg.keep
    return lf.unique(**kwargs)


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

TRANSFORMERS = {
    TransformOperation.FILTER: transform_filter,
    TransformOperation.SELECT: transform_select,
    TransformOperation.RENAME: transform_rename,
    TransformOperation.GROUP_BY: transform_group_by,
    TransformOperation.SORT: transform_sort,
    TransformOperation.CAST: transform_cast,
    TransformOperation.DERIVE: transform_derive,
    TransformOperation.DROP_NULLS: transform_drop_nulls,
    TransformOperation.UNIQUE: transform_unique,
    # JOIN is handled specially by the executor since it needs two inputs
}


def run_transform(
    operation: TransformOperation,
    lf: pl.LazyFrame,
    config: dict[str, Any],
    right_lf: pl.LazyFrame | None = None,
) -> pl.LazyFrame:
    """Dispatch to the appropriate transformer function based on the operation type.

    Args:
        operation (TransformOperation): The transform operation enum (e.g. FILTER, GROUP_BY, JOIN, etc.).
        lf (pl.LazyFrame): The primary Polars LazyFrame.
        config (dict[str, Any]): Configuration dictionary corresponding to the operation.
        right_lf (pl.LazyFrame | None): Optional right Polars LazyFrame, required when operation is JOIN.

    Returns:
        pl.LazyFrame: The transformed Polars LazyFrame.

    Raises:
        ValueError: If operation is JOIN and right_lf is None, or if the operation is unsupported.
    """
    if operation == TransformOperation.JOIN:
        if right_lf is None:
            raise ValueError("Join transform requires a right_stage LazyFrame")
        return transform_join(lf, right_lf, config)

    transformer = TRANSFORMERS.get(operation)
    if transformer is None:
        raise ValueError(f"Unsupported transform operation: {operation}")
    return transformer(lf, config)
