/**
 * Run panel — execute pipeline and display results with stage-level metrics.
 */

import { useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Rows3,
} from 'lucide-react';

import { createPipeline, updatePipeline, runPipeline } from '../api/client';
import type { PipelineRunResult, StageResult } from '../types/pipeline';
import type { UsePipelineSyncReturn } from '../hooks/usePipelineSync';

interface RunPanelProps {
  sync: UsePipelineSyncReturn;
}

export function RunPanel({ sync }: RunPanelProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const config = sync.getConfig();
      if (sync.pipelineId) {
        await updatePipeline(sync.pipelineId, config);
      } else {
        const res = await createPipeline(config);
        sync.setPipelineId(res.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      // Save first
      const config = sync.getConfig();
      let id = sync.pipelineId;
      if (!id) {
        const res = await createPipeline(config);
        id = res.id;
        sync.setPipelineId(id);
      } else {
        await updatePipeline(id, config);
      }

      // Then run
      const runResult = await runPipeline(id);
      setResult(runResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="run-panel">
      <div className="run-panel__buttons">
        <button
          className="run-panel__btn run-panel__btn--save"
          onClick={handleSave}
          disabled={saving || running}
        >
          {saving ? <Loader2 size={14} className="spin" /> : null}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          className="run-panel__btn run-panel__btn--run"
          onClick={handleRun}
          disabled={running || sync.nodes.length === 0}
        >
          {running ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? 'Running…' : 'Run Pipeline'}
        </button>
      </div>

      {error && (
        <div className="run-panel__error">
          <XCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="run-panel__result">
          <div className={`run-panel__status run-panel__status--${result.status}`}>
            {result.status === 'success' && <CheckCircle2 size={16} />}
            {result.status === 'error' && <XCircle size={16} />}
            {result.status === 'partial' && <AlertTriangle size={16} />}
            <span>{result.status.toUpperCase()}</span>
            <span className="run-panel__duration">
              <Clock size={12} />
              {result.total_duration_ms.toFixed(1)}ms
            </span>
          </div>

          <div className="run-panel__stages">
            {result.stage_results.map((sr: StageResult) => (
              <StageResultRow key={sr.stage_id} result={sr} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StageResultRow({ result }: { result: StageResult }) {
  return (
    <div className={`stage-result stage-result--${result.status}`}>
      <div className="stage-result__icon">
        {result.status === 'success' && <CheckCircle2 size={13} />}
        {result.status === 'error' && <XCircle size={13} />}
        {result.status === 'skipped' && <AlertTriangle size={13} />}
      </div>
      <span className="stage-result__id">{result.stage_id}</span>
      <span className="stage-result__metrics">
        {result.rows_affected > 0 && (
          <span className="stage-result__rows">
            <Rows3 size={11} />
            {result.rows_affected}
          </span>
        )}
        <span className="stage-result__time">
          <Clock size={11} />
          {result.duration_ms.toFixed(1)}ms
        </span>
      </span>
      {result.error && (
        <div className="stage-result__error">{result.error}</div>
      )}
    </div>
  );
}
