"""
Data source extractors — read data into Polars LazyFrames.

Each extractor returns a pl.LazyFrame for deferred execution,
letting the Polars query optimizer push down predicates and projections.
"""

from pathlib import Path

import polars as pl

from app.models.pipeline import ExtractConfig, ExtractSource

# Mapping from YAML dtype strings to Polars dtypes
DTYPE_MAP: dict[str, pl.DataType] = {
    "Int8": pl.Int8,
    "Int16": pl.Int16,
    "Int32": pl.Int32,
    "Int64": pl.Int64,
    "UInt8": pl.UInt8,
    "UInt16": pl.UInt16,
    "UInt32": pl.UInt32,
    "UInt64": pl.UInt64,
    "Float32": pl.Float32,
    "Float64": pl.Float64,
    "Utf8": pl.Utf8,
    "String": pl.Utf8,
    "Boolean": pl.Boolean,
    "Date": pl.Date,
    "Datetime": pl.Datetime,
}


def _resolve_dtypes(dtypes: dict[str, str] | None) -> dict[str, pl.DataType] | None:
    """Convert string dtype names from YAML configuration to Polars DataType objects.

    Args:
        dtypes (dict[str, str] | None): A dictionary mapping column names to dtype strings
            (e.g., {"id": "Int64", "revenue": "Float64"}), or None.

    Returns:
        dict[str, pl.DataType] | None: A dictionary mapping column names to Polars
            DataType instances, or None if dtypes was None.

    Raises:
        ValueError: If an unknown or unsupported dtype string is encountered.
    """
    if dtypes is None:
        return None
    resolved = {}
    for col, dtype_str in dtypes.items():
        if dtype_str in DTYPE_MAP:
            resolved[col] = DTYPE_MAP[dtype_str]
        else:
            raise ValueError(
                f"Unknown dtype '{dtype_str}' for column '{col}'. "
                f"Valid types: {list(DTYPE_MAP.keys())}"
            )
    return resolved


def extract_csv(config: ExtractConfig) -> pl.LazyFrame:
    """Extract data from a CSV file into a Polars LazyFrame.

    Args:
        config (ExtractConfig): Extraction configuration containing file path, separator,
            header flags, optional column dtype overrides, and row limit.

    Returns:
        pl.LazyFrame: A lazy query plan scanning the specified CSV file.

    Raises:
        FileNotFoundError: If the CSV file at the configured path does not exist.
        ValueError: If any invalid column data type is specified in dtypes.
    """
    path = Path(config.path)
    if not path.exists():
        raise FileNotFoundError(f"CSV file not found: {path.resolve()}")

    kwargs: dict = {
        "source": str(path),
        "separator": config.separator,
        "has_header": config.has_header,
    }

    dtypes = _resolve_dtypes(config.dtypes)
    if dtypes:
        kwargs["dtypes"] = dtypes

    if config.n_rows is not None:
        kwargs["n_rows"] = config.n_rows

    return pl.scan_csv(**kwargs)


def extract_json(config: ExtractConfig) -> pl.LazyFrame:
    """Extract data from a JSON file into a Polars LazyFrame.

    Reads the JSON file eagerly and converts it into a LazyFrame for pipeline chaining.

    Args:
        config (ExtractConfig): Extraction configuration containing file path and optional row limit.

    Returns:
        pl.LazyFrame: A lazy frame wrapping the extracted JSON data.

    Raises:
        FileNotFoundError: If the JSON file at the configured path does not exist.
    """
    path = Path(config.path)
    if not path.exists():
        raise FileNotFoundError(f"JSON file not found: {path.resolve()}")

    df = pl.read_json(str(path))

    if config.n_rows is not None:
        df = df.head(config.n_rows)

    return df.lazy()


def extract_parquet(config: ExtractConfig) -> pl.LazyFrame:
    """Extract data from a Parquet file into a Polars LazyFrame.

    Scans the Parquet file lazily using Polars' native columnar reader.

    Args:
        config (ExtractConfig): Extraction configuration containing file path and optional row limit.

    Returns:
        pl.LazyFrame: A lazy query plan scanning the specified Parquet file.

    Raises:
        FileNotFoundError: If the Parquet file at the configured path does not exist.
    """
    path = Path(config.path)
    if not path.exists():
        raise FileNotFoundError(f"Parquet file not found: {path.resolve()}")

    lf = pl.scan_parquet(str(path))

    if config.n_rows is not None:
        lf = lf.head(config.n_rows)

    return lf


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

EXTRACTORS = {
    ExtractSource.CSV: extract_csv,
    ExtractSource.JSON: extract_json,
    ExtractSource.PARQUET: extract_parquet,
}


def run_extract(source: ExtractSource, config: ExtractConfig) -> pl.LazyFrame:
    """Dispatch to the appropriate extractor based on source type.

    Args:
        source (ExtractSource): The type of data source (e.g. ExtractSource.CSV,
            ExtractSource.JSON, or ExtractSource.PARQUET).
        config (ExtractConfig): Extraction parameters for the chosen source.

    Returns:
        pl.LazyFrame: Polars LazyFrame produced by the matched extractor.

    Raises:
        ValueError: If the specified extract source is unsupported.
    """
    extractor = EXTRACTORS.get(source)
    if extractor is None:
        raise ValueError(f"Unsupported extract source: {source}")
    return extractor(config)
