/**
 * Pipeline list / dashboard — lists all saved pipelines.
 */

import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  FolderOpen,
  Clock,
  Layers,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

import {
  fetchPipelines,
  fetchPipeline,
  deletePipeline,
} from '../api/client';
import type { PipelineListItem, PipelineConfig } from '../types/pipeline';
import { load as yamlLoad } from 'js-yaml';

interface PipelineListProps {
  onOpen: (config: PipelineConfig, id: string) => void;
  onNew: () => void;
}

export function PipelineList({ onOpen, onNew }: PipelineListProps) {
  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchPipelines()
      .then(setPipelines)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpen = async (id: string) => {
    try {
      const detail = await fetchPipeline(id);
      const config = yamlLoad(detail.yaml_config) as PipelineConfig;
      onOpen(config, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open pipeline');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pipeline?')) return;
    try {
      await deletePipeline(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="pipeline-list">
      <div className="pipeline-list__header">
        <h2>Saved Pipelines</h2>
        <button className="pipeline-list__new-btn" onClick={onNew}>
          <Plus size={14} />
          New Pipeline
        </button>
      </div>

      {error && (
        <div className="pipeline-list__error">
          <XCircle size={14} />
          {error}
        </div>
      )}

      {loading && (
        <div className="pipeline-list__loading">
          <Loader2 size={20} className="spin" />
          <span>Loading pipelines…</span>
        </div>
      )}

      {!loading && pipelines.length === 0 && (
        <div className="pipeline-list__empty">
          <Layers size={32} />
          <p>No pipelines saved yet</p>
          <button onClick={onNew}>Create your first pipeline</button>
        </div>
      )}

      <div className="pipeline-list__grid">
        {pipelines.map((p) => (
          <div key={p.id} className="pipeline-card">
            <div className="pipeline-card__header">
              <h3>{p.name}</h3>
              {p.last_run_status && (
                <span className={`pipeline-card__status pipeline-card__status--${p.last_run_status}`}>
                  {p.last_run_status === 'success' ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <XCircle size={12} />
                  )}
                  {p.last_run_status}
                </span>
              )}
            </div>
            {p.description && (
              <p className="pipeline-card__desc">{p.description}</p>
            )}
            <div className="pipeline-card__meta">
              <span>
                <Layers size={12} />
                {p.stage_count} stages
              </span>
              {p.updated_at && (
                <span>
                  <Clock size={12} />
                  {new Date(p.updated_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="pipeline-card__actions">
              <button onClick={() => handleOpen(p.id)} title="Open">
                <FolderOpen size={14} />
                Open
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="pipeline-card__delete"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
