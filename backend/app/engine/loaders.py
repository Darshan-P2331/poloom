"""
Data sink loaders — write Polars DataFrames to output destinations.

Each loader collects a LazyFrame and writes to the target format.
Returns the number of rows written.
"""

from pathlib import Path

import polars as pl

from app.models.pipeline import LoadConfig, LoadSink


def load_csv(lf: pl.LazyFrame, config: LoadConfig) -> int:
    """Materialize a LazyFrame and write it to a CSV file.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame to materialize.
        config (LoadConfig): Load configuration containing the output path and optional separator.

    Returns:
        int: The number of rows written to the CSV file.
    """
    path = Path(config.path)
    path.parent.mkdir(parents=True, exist_ok=True)

    df = lf.collect()
    df.write_csv(str(path), separator=config.separator)
    return len(df)


def load_json(lf: pl.LazyFrame, config: LoadConfig) -> int:
    """Materialize a LazyFrame and write it to a JSON file.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame to materialize.
        config (LoadConfig): Load configuration containing the output path.

    Returns:
        int: The number of rows written to the JSON file.
    """
    path = Path(config.path)
    path.parent.mkdir(parents=True, exist_ok=True)

    df = lf.collect()
    df.write_json(str(path))
    return len(df)


def load_parquet(lf: pl.LazyFrame, config: LoadConfig) -> int:
    """Materialize a LazyFrame and write it to a Parquet file.

    Args:
        lf (pl.LazyFrame): The incoming Polars LazyFrame to materialize.
        config (LoadConfig): Load configuration containing the output path and optional compression codec.

    Returns:
        int: The number of rows written to the Parquet file.
    """
    path = Path(config.path)
    path.parent.mkdir(parents=True, exist_ok=True)

    df = lf.collect()
    kwargs: dict = {"file": str(path)}
    if config.compression and config.compression != "none":
        kwargs["compression"] = config.compression

    df.write_parquet(**kwargs)
    return len(df)


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

LOADERS = {
    LoadSink.CSV: load_csv,
    LoadSink.JSON: load_json,
    LoadSink.PARQUET: load_parquet,
}


def run_load(sink: LoadSink, lf: pl.LazyFrame, config: LoadConfig) -> int:
    """Dispatch to the appropriate loader function based on sink type.

    Args:
        sink (LoadSink): The target data sink type (CSV, JSON, or PARQUET).
        lf (pl.LazyFrame): The Polars LazyFrame to export.
        config (LoadConfig): Sink configuration options.

    Returns:
        int: Total number of rows written to the sink.

    Raises:
        ValueError: If the specified sink type is unsupported.
    """
    loader = LOADERS.get(sink)
    if loader is None:
        raise ValueError(f"Unsupported load sink: {sink}")
    return loader(lf, config)
