/**
 * Typed API client for the Poloom backend.
 */

import type {
  PipelineConfig,
  PipelineDetail,
  PipelineListItem,
  PipelineRunResult,
  StageTypeInfo,
  ValidationResult,
} from '../types/pipeline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Stage types (palette catalog)
// ---------------------------------------------------------------------------

export async function fetchStageTypes(): Promise<StageTypeInfo[]> {
  return request('/api/stage-types');
}

// ---------------------------------------------------------------------------
// Pipelines CRUD
// ---------------------------------------------------------------------------

export async function fetchPipelines(): Promise<PipelineListItem[]> {
  return request('/api/pipelines');
}

export async function fetchPipeline(id: string): Promise<PipelineDetail> {
  return request(`/api/pipelines/${id}`);
}

export async function createPipeline(
  config: PipelineConfig,
): Promise<{ id: string; message: string }> {
  return request('/api/pipelines', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function updatePipeline(
  id: string,
  config: PipelineConfig,
): Promise<{ id: string; message: string }> {
  return request(`/api/pipelines/${id}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function deletePipeline(id: string): Promise<{ message: string }> {
  return request(`/api/pipelines/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function runPipeline(id: string): Promise<PipelineRunResult> {
  return request(`/api/pipelines/${id}/run`, { method: 'POST' });
}

export async function fetchPipelineRuns(
  id: string,
): Promise<Record<string, unknown>[]> {
  return request(`/api/pipelines/${id}/runs`);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateYaml(yamlConfig: string): Promise<ValidationResult> {
  return request('/api/validate', {
    method: 'POST',
    body: JSON.stringify({ yaml_config: yamlConfig }),
  });
}
