/**
 * TypeScript interfaces mirroring the backend Pydantic models.
 * These define the contract between frontend and backend.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type StageType = 'extract' | 'transform' | 'load';
export type ExtractSource = 'csv' | 'json' | 'parquet';
export type LoadSink = 'csv' | 'json' | 'parquet';
export type TransformOperation =
  | 'filter'
  | 'select'
  | 'rename'
  | 'group_by'
  | 'sort'
  | 'cast'
  | 'join'
  | 'derive'
  | 'drop_nulls'
  | 'unique';

export type FilterOperator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'is_null' | 'is_not_null'
  | 'contains' | 'starts_with' | 'ends_with';

export type AggFunction = 'sum' | 'mean' | 'count' | 'min' | 'max' | 'first' | 'last';
export type JoinHow = 'inner' | 'left' | 'right' | 'outer' | 'cross';

// ---------------------------------------------------------------------------
// Config models
// ---------------------------------------------------------------------------

export interface ExtractConfig {
  path: string;
  separator?: string;
  has_header?: boolean;
  dtypes?: Record<string, string>;
  n_rows?: number;
}

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface AggregationSpec {
  column: string;
  function: AggFunction;
  alias?: string;
}

export interface LoadConfig {
  path: string;
  separator?: string;
  compression?: 'snappy' | 'gzip' | 'lz4' | 'zstd' | 'none';
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export interface StageConfig {
  id: string;
  type: StageType;
  depends_on?: string[];

  // Extract
  source?: ExtractSource;
  extract_config?: ExtractConfig;

  // Transform
  operation?: TransformOperation;
  transform_config?: Record<string, unknown>;

  // Load
  sink?: LoadSink;
  load_config?: LoadConfig;

  // UI metadata
  position?: { x: number; y: number };
  label?: string;
}

export interface SelectConfig {
  columns: string[];
}

export interface RenameConfig {
  mapping: Record<string, string>;
}

export interface GroupByConfig {
  group_by: string[];
  aggregations: AggregationSpec[];
}

export interface SortConfig {
  by: string[];
  descending?: boolean | boolean[];
}

export interface CastConfig {
  mapping: Record<string, string>;
}

export interface JoinConfig {
  right_stage: string;
  on?: string[];
  left_on?: string[];
  right_on?: string[];
  how?: JoinHow;
}

export interface DeriveConfig {
  columns: Record<string, string>;
}

export interface DropNullsConfig {
  subset?: string[];
}

export interface UniqueConfig {
  subset?: string[];
  keep?: 'first' | 'last' | 'any' | 'none';
}

export interface FilterConfig {
  conditions: FilterCondition[];
  logic?: 'and' | 'or';
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface PipelineMetadata {
  name: string;
  description?: string;
  version?: string;
  variables?: Record<string, unknown>;
}

export interface PipelineConfig {
  pipeline: PipelineMetadata;
  stages: StageConfig[];
}

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface StageResult {
  stage_id: string;
  status: 'success' | 'error' | 'skipped';
  rows_affected: number;
  duration_ms: number;
  error?: string | null;
}

export interface PipelineRunResult {
  pipeline_id: string;
  pipeline_name: string;
  status: 'success' | 'error' | 'partial';
  total_duration_ms: number;
  stage_results: StageResult[];
  error?: string | null;
}

export interface PipelineListItem {
  id: string;
  name: string;
  description: string;
  stage_count: number;
  last_run_status?: string | null;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageTypeInfo {
  type: StageType;
  category: string;
  name: string;
  description: string;
  icon: string;
  config_schema: Record<string, unknown>;
}

export interface PipelineDetail {
  id: string;
  name: string;
  description: string;
  yaml_config: string;
  stage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  valid: boolean;
  pipeline_name?: string;
  stage_count?: number;
  error?: string;
}
