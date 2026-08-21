/**
 * Stage configuration panel — comprehensive dynamic forms for every stage operation,
 * with structured editors for select, filter, groupby, rename, cast, derive, join, etc.
 */

import { useState } from 'react';
import {
  X,
  Trash2,
  Plus,
  Code,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type {
  StageConfig,
  FilterCondition,
  FilterOperator,
  AggFunction,
  AggregationSpec,
  JoinHow,
} from '../types/pipeline';
import type { UsePipelineSyncReturn } from '../hooks/usePipelineSync';

interface StageConfigPanelProps {
  sync: UsePipelineSyncReturn;
}

export function StageConfigPanel({ sync }: StageConfigPanelProps) {
  const { selectedNode, updateStageConfig, removeStage, selectNode, nodes, metadata } = sync;
  const [rawJsonMode, setRawJsonMode] = useState(false);

  if (!selectedNode) {
    return (
      <div className="config-panel config-panel--empty">
        <div className="config-panel__empty-state">
          <Layers size={36} className="text-muted" />
          <h4>No Stage Selected</h4>
          <p>Click any node on the canvas to configure its properties and transformation parameters.</p>
        </div>
      </div>
    );
  }

  const stage = selectedNode.data.stage as StageConfig;
  const variables = metadata.variables || {};
  const varKeys = Object.keys(variables);

  const update = (updates: Partial<StageConfig>) => {
    updateStageConfig(selectedNode.id, updates);
  };

  const otherStageIds = nodes
    .filter((n) => n.id !== selectedNode.id)
    .map((n) => n.id);

  return (
    <div className="config-panel">
      <div className="config-panel__header">
        <div className="config-panel__title-wrap">
          <span className={`config-badge config-badge--${stage.type}`}>
            {stage.type.toUpperCase()}
          </span>
          <h3>{stage.label || stage.id}</h3>
        </div>
        <div className="config-panel__actions">
          <button
            type="button"
            className={`config-panel__btn ${rawJsonMode ? 'config-panel__btn--active' : ''}`}
            onClick={() => setRawJsonMode(!rawJsonMode)}
            title="Toggle Raw JSON Mode"
          >
            <Code size={14} />
          </button>
          <button
            type="button"
            className="config-panel__btn config-panel__btn--danger"
            onClick={() => removeStage(selectedNode.id)}
            title="Delete stage"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className="config-panel__btn"
            onClick={() => selectNode(null)}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Variables Quick Bar */}
      {varKeys.length > 0 && (
        <div className="config-vars-bar">
          <span className="config-vars-bar__label">
            <Sparkles size={11} /> Vars:
          </span>
          <div className="config-vars-bar__list">
            {varKeys.map((vk) => (
              <span
                key={vk}
                className="config-var-pill"
                title={`Click to copy \${${vk}}`}
                onClick={() => navigator.clipboard.writeText(`\${${vk}}`)}
              >
                {`\${${vk}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="config-panel__body">
        {/* Core metadata */}
        <div className="config-section">
          <div className="config-field">
            <label>Stage ID</label>
            <input
              type="text"
              value={stage.id}
              readOnly
              className="config-input config-input--readonly"
            />
          </div>

          <div className="config-field">
            <label>Display Label</label>
            <input
              type="text"
              value={stage.label || ''}
              onChange={(e) => update({ label: e.target.value })}
              className="config-input"
              placeholder="e.g. Clean Customer Data"
            />
          </div>
        </div>

        {/* Dynamic stage forms */}
        {rawJsonMode ? (
          <RawJsonEditor stage={stage} onUpdate={update} />
        ) : (
          <>
            {stage.type === 'extract' && (
              <ExtractFields stage={stage} onUpdate={update} />
            )}
            {stage.type === 'transform' && (
              <TransformFields
                stage={stage}
                onUpdate={update}
                otherStageIds={otherStageIds}
              />
            )}
            {stage.type === 'load' && (
              <LoadFields stage={stage} onUpdate={update} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raw JSON Editor fallback
// ---------------------------------------------------------------------------

function RawJsonEditor({
  stage,
  onUpdate,
}: {
  stage: StageConfig;
  onUpdate: (u: Partial<StageConfig>) => void;
}) {
  const targetKey =
    stage.type === 'extract'
      ? 'extract_config'
      : stage.type === 'transform'
      ? 'transform_config'
      : 'load_config';

  const cfg = stage[targetKey] || {};

  return (
    <div className="config-field">
      <label>Raw JSON Configuration</label>
      <textarea
        value={JSON.stringify(cfg, null, 2)}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            onUpdate({ [targetKey]: parsed });
          } catch {
            // Keep editing
          }
        }}
        className="config-input config-textarea"
        rows={12}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extract Fields
// ---------------------------------------------------------------------------

function ExtractFields({
  stage,
  onUpdate,
}: {
  stage: StageConfig;
  onUpdate: (u: Partial<StageConfig>) => void;
}) {
  const cfg = stage.extract_config || { path: '' };

  const updateCfg = (updates: Record<string, unknown>) => {
    onUpdate({ extract_config: { ...cfg, ...updates } as StageConfig['extract_config'] });
  };

  // Dtype mappings
  const dtypes = cfg.dtypes || {};
  const [newCol, setNewCol] = useState('');
  const [newDtype, setNewDtype] = useState('Utf8');

  const addDtype = () => {
    if (!newCol.trim()) return;
    updateCfg({
      dtypes: {
        ...dtypes,
        [newCol.trim()]: newDtype,
      },
    });
    setNewCol('');
  };

  const removeDtype = (col: string) => {
    const next = { ...dtypes };
    delete next[col];
    updateCfg({ dtypes: next });
  };

  return (
    <div className="config-section">
      <div className="config-field">
        <label>Source Type</label>
        <select
          value={stage.source || 'csv'}
          onChange={(e) => onUpdate({ source: e.target.value as StageConfig['source'] })}
          className="config-input config-input--select"
        >
          <option value="csv">CSV File</option>
          <option value="json">JSON File</option>
          <option value="parquet">Parquet Columnar</option>
        </select>
      </div>

      <div className="config-field">
        <label>File Path</label>
        <input
          type="text"
          value={cfg.path || ''}
          onChange={(e) => updateCfg({ path: e.target.value })}
          placeholder="./sample_data/customers.csv or ${data_path}"
          className="config-input"
        />
      </div>

      {stage.source === 'csv' && (
        <>
          <div className="config-row">
            <div className="config-field">
              <label>Separator</label>
              <input
                type="text"
                value={cfg.separator ?? ','}
                onChange={(e) => updateCfg({ separator: e.target.value })}
                className="config-input"
                maxLength={4}
              />
            </div>
            <div className="config-field config-field--checkbox-inline">
              <label>
                <input
                  type="checkbox"
                  checked={cfg.has_header !== false}
                  onChange={(e) => updateCfg({ has_header: e.target.checked })}
                />
                Header Row
              </label>
            </div>
          </div>

          {/* Dtypes Schema Map */}
          <div className="config-field">
            <label>Explicit Schema Types (Optional)</label>
            <div className="config-keyvalue-list">
              {Object.entries(dtypes).map(([col, dt]) => (
                <div key={col} className="config-keyvalue-row">
                  <span className="config-keyvalue-key">{col}</span>
                  <ArrowRight size={12} className="text-muted" />
                  <span className="config-keyvalue-val">{dt}</span>
                  <button
                    type="button"
                    onClick={() => removeDtype(col)}
                    className="config-item-remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="config-inline-add">
              <input
                type="text"
                placeholder="Column name"
                value={newCol}
                onChange={(e) => setNewCol(e.target.value)}
                className="config-input"
              />
              <select
                value={newDtype}
                onChange={(e) => setNewDtype(e.target.value)}
                className="config-input config-input--select"
              >
                {DTYPE_OPTIONS.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addDtype} className="config-btn-sm">
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
        </>
      )}

      <div className="config-field">
        <label>Row Limit (n_rows, Optional)</label>
        <input
          type="number"
          value={cfg.n_rows ?? ''}
          onChange={(e) =>
            updateCfg({ n_rows: e.target.value ? Number(e.target.value) : undefined })
          }
          placeholder="e.g. 1000 (empty for all)"
          className="config-input"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transform Fields
// ---------------------------------------------------------------------------

function TransformFields({
  stage,
  onUpdate,
  otherStageIds,
}: {
  stage: StageConfig;
  onUpdate: (u: Partial<StageConfig>) => void;
  otherStageIds: string[];
}) {
  const op = stage.operation || 'filter';
  const cfg = stage.transform_config || {};

  const updateCfg = (updates: Record<string, unknown>) => {
    onUpdate({ transform_config: { ...cfg, ...updates } });
  };

  return (
    <div className="config-section">
      <div className="config-field">
        <label>Transform Operation</label>
        <select
          value={op}
          onChange={(e) => onUpdate({ operation: e.target.value as StageConfig['operation'] })}
          className="config-input config-input--select"
        >
          <option value="select">Select Columns (Projection)</option>
          <option value="filter">Filter Rows (Conditions)</option>
          <option value="group_by">Group By & Aggregate</option>
          <option value="sort">Sort Rows</option>
          <option value="rename">Rename Columns</option>
          <option value="cast">Cast Data Types</option>
          <option value="derive">Derive New Columns</option>
          <option value="drop_nulls">Drop Null Rows</option>
          <option value="unique">Unique Deduplication</option>
          <option value="join">Join with Another Stage</option>
        </select>
      </div>

      {op === 'select' && <SelectForm cfg={cfg} onChange={updateCfg} />}
      {op === 'filter' && <FilterForm cfg={cfg} onChange={updateCfg} />}
      {op === 'group_by' && <GroupByForm cfg={cfg} onChange={updateCfg} />}
      {op === 'sort' && <SortForm cfg={cfg} onChange={updateCfg} />}
      {op === 'rename' && <RenameForm cfg={cfg} onChange={updateCfg} />}
      {op === 'cast' && <CastForm cfg={cfg} onChange={updateCfg} />}
      {op === 'derive' && <DeriveForm cfg={cfg} onChange={updateCfg} />}
      {op === 'drop_nulls' && <DropNullsForm cfg={cfg} onChange={updateCfg} />}
      {op === 'unique' && <UniqueForm cfg={cfg} onChange={updateCfg} />}
      {op === 'join' && (
        <JoinForm cfg={cfg} onChange={updateCfg} otherStageIds={otherStageIds} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operation-specific forms
// ---------------------------------------------------------------------------

function SelectForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const columns = (cfg.columns as string[]) || [];
  const [colInput, setColInput] = useState('');

  const addColumn = () => {
    const trimmed = colInput.trim();
    if (!trimmed || columns.includes(trimmed)) return;
    onChange({ columns: [...columns, trimmed] });
    setColInput('');
  };

  const removeColumn = (col: string) => {
    onChange({ columns: columns.filter((c) => c !== col) });
  };

  return (
    <div className="config-field">
      <label>Columns to Keep</label>
      <div className="config-tags">
        {columns.map((col) => (
          <span key={col} className="config-tag">
            {col}
            <button type="button" onClick={() => removeColumn(col)}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="config-inline-add">
        <input
          type="text"
          placeholder="Add column name"
          value={colInput}
          onChange={(e) => setColInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addColumn())}
          className="config-input"
        />
        <button type="button" onClick={addColumn} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function FilterForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const conditions = (cfg.conditions as FilterCondition[]) || [];
  const logic = (cfg.logic as string) || 'and';

  const [field, setField] = useState('');
  const [operator, setOperator] = useState<FilterOperator>('eq');
  const [val, setVal] = useState('');

  const addCondition = () => {
    if (!field.trim()) return;
    onChange({
      logic,
      conditions: [
        ...conditions,
        {
          field: field.trim(),
          operator,
          value: val.trim(),
        },
      ],
    });
    setField('');
    setVal('');
  };

  const removeCondition = (idx: number) => {
    onChange({
      logic,
      conditions: conditions.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="config-field">
      <div className="config-row-between">
        <label>Conditions</label>
        <div className="config-logic-toggle">
          <button
            type="button"
            className={`config-logic-btn ${logic === 'and' ? 'config-logic-btn--active' : ''}`}
            onClick={() => onChange({ conditions, logic: 'and' })}
          >
            AND
          </button>
          <button
            type="button"
            className={`config-logic-btn ${logic === 'or' ? 'config-logic-btn--active' : ''}`}
            onClick={() => onChange({ conditions, logic: 'or' })}
          >
            OR
          </button>
        </div>
      </div>

      <div className="config-items-stack">
        {conditions.map((cond, idx) => (
          <div key={idx} className="config-cond-row">
            <span className="config-cond-field">{cond.field}</span>
            <span className="config-cond-op">{cond.operator}</span>
            <span className="config-cond-val">{String(cond.value ?? '')}</span>
            <button
              type="button"
              onClick={() => removeCondition(idx)}
              className="config-item-remove"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="config-inline-cond-add">
        <input
          type="text"
          placeholder="Field name"
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="config-input"
        />
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value as FilterOperator)}
          className="config-input config-input--select"
        >
          {FILTER_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Value or ${var}"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="config-input"
        />
        <button type="button" onClick={addCondition} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function GroupByForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const groupBy = (cfg.group_by as string[]) || [];
  const aggregations = (cfg.aggregations as AggregationSpec[]) || [];

  const [groupCol, setGroupCol] = useState('');
  const [aggCol, setAggCol] = useState('');
  const [aggFunc, setAggFunc] = useState<AggFunction>('sum');
  const [aggAlias, setAggAlias] = useState('');

  const addGroupCol = () => {
    const trimmed = groupCol.trim();
    if (!trimmed || groupBy.includes(trimmed)) return;
    onChange({
      group_by: [...groupBy, trimmed],
      aggregations,
    });
    setGroupCol('');
  };

  const removeGroupCol = (col: string) => {
    onChange({
      group_by: groupBy.filter((c) => c !== col),
      aggregations,
    });
  };

  const addAgg = () => {
    if (!aggCol.trim()) return;
    onChange({
      group_by: groupBy,
      aggregations: [
        ...aggregations,
        {
          column: aggCol.trim(),
          function: aggFunc,
          alias: aggAlias.trim() || undefined,
        },
      ],
    });
    setAggCol('');
    setAggAlias('');
  };

  const removeAgg = (idx: number) => {
    onChange({
      group_by: groupBy,
      aggregations: aggregations.filter((_, i) => i !== idx),
    });
  };

  return (
    <>
      <div className="config-field">
        <label>Group By Columns</label>
        <div className="config-tags">
          {groupBy.map((col) => (
            <span key={col} className="config-tag">
              {col}
              <button type="button" onClick={() => removeGroupCol(col)}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="config-inline-add">
          <input
            type="text"
            placeholder="Grouping column"
            value={groupCol}
            onChange={(e) => setGroupCol(e.target.value)}
            className="config-input"
          />
          <button type="button" onClick={addGroupCol} className="config-btn-sm">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      <div className="config-field">
        <label>Aggregations</label>
        <div className="config-items-stack">
          {aggregations.map((agg, idx) => (
            <div key={idx} className="config-cond-row">
              <span className="config-cond-field">{agg.column}</span>
              <span className="config-cond-op">{agg.function}</span>
              <span className="config-cond-val">{agg.alias || '(auto)'}</span>
              <button
                type="button"
                onClick={() => removeAgg(idx)}
                className="config-item-remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="config-inline-cond-add">
          <input
            type="text"
            placeholder="Column"
            value={aggCol}
            onChange={(e) => setAggCol(e.target.value)}
            className="config-input"
          />
          <select
            value={aggFunc}
            onChange={(e) => setAggFunc(e.target.value as AggFunction)}
            className="config-input config-input--select"
          >
            <option value="sum">sum</option>
            <option value="mean">mean</option>
            <option value="count">count</option>
            <option value="min">min</option>
            <option value="max">max</option>
            <option value="first">first</option>
            <option value="last">last</option>
          </select>
          <input
            type="text"
            placeholder="Alias (optional)"
            value={aggAlias}
            onChange={(e) => setAggAlias(e.target.value)}
            className="config-input"
          />
          <button type="button" onClick={addAgg} className="config-btn-sm">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
    </>
  );
}

function SortForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const by = (cfg.by as string[]) || [];
  const descending = Boolean(cfg.descending);
  const [colInput, setColInput] = useState('');

  const addCol = () => {
    if (!colInput.trim() || by.includes(colInput.trim())) return;
    onChange({ by: [...by, colInput.trim()], descending });
    setColInput('');
  };

  const removeCol = (col: string) => {
    onChange({ by: by.filter((c) => c !== col), descending });
  };

  return (
    <div className="config-field">
      <div className="config-row-between">
        <label>Sort Columns</label>
        <div className="config-field--checkbox-inline">
          <label>
            <input
              type="checkbox"
              checked={descending}
              onChange={(e) => onChange({ by, descending: e.target.checked })}
            />
            Descending
          </label>
        </div>
      </div>

      <div className="config-tags">
        {by.map((col) => (
          <span key={col} className="config-tag">
            {col}
            <button type="button" onClick={() => removeCol(col)}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      <div className="config-inline-add">
        <input
          type="text"
          placeholder="Column name"
          value={colInput}
          onChange={(e) => setColInput(e.target.value)}
          className="config-input"
        />
        <button type="button" onClick={addCol} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function RenameForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const mapping = (cfg.mapping as Record<string, string>) || {};
  const [oldCol, setOldCol] = useState('');
  const [newCol, setNewCol] = useState('');

  const addMapping = () => {
    if (!oldCol.trim() || !newCol.trim()) return;
    onChange({
      mapping: {
        ...mapping,
        [oldCol.trim()]: newCol.trim(),
      },
    });
    setOldCol('');
    setNewCol('');
  };

  const removeMapping = (k: string) => {
    const next = { ...mapping };
    delete next[k];
    onChange({ mapping: next });
  };

  return (
    <div className="config-field">
      <label>Rename Mappings</label>
      <div className="config-keyvalue-list">
        {Object.entries(mapping).map(([k, v]) => (
          <div key={k} className="config-keyvalue-row">
            <span className="config-keyvalue-key">{k}</span>
            <ArrowRight size={12} className="text-muted" />
            <span className="config-keyvalue-val">{v}</span>
            <button
              type="button"
              onClick={() => removeMapping(k)}
              className="config-item-remove"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="config-inline-add">
        <input
          type="text"
          placeholder="Old column name"
          value={oldCol}
          onChange={(e) => setOldCol(e.target.value)}
          className="config-input"
        />
        <input
          type="text"
          placeholder="New column name"
          value={newCol}
          onChange={(e) => setNewCol(e.target.value)}
          className="config-input"
        />
        <button type="button" onClick={addMapping} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function CastForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const mapping = (cfg.mapping as Record<string, string>) || {};
  const [col, setCol] = useState('');
  const [dtype, setDtype] = useState('Float64');

  const addRule = () => {
    if (!col.trim()) return;
    onChange({
      mapping: {
        ...mapping,
        [col.trim()]: dtype,
      },
    });
    setCol('');
  };

  const removeRule = (k: string) => {
    const next = { ...mapping };
    delete next[k];
    onChange({ mapping: next });
  };

  return (
    <div className="config-field">
      <label>Cast Column Types</label>
      <div className="config-keyvalue-list">
        {Object.entries(mapping).map(([k, dt]) => (
          <div key={k} className="config-keyvalue-row">
            <span className="config-keyvalue-key">{k}</span>
            <ArrowRight size={12} className="text-muted" />
            <span className="config-keyvalue-val">{dt}</span>
            <button
              type="button"
              onClick={() => removeRule(k)}
              className="config-item-remove"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="config-inline-add">
        <input
          type="text"
          placeholder="Column name"
          value={col}
          onChange={(e) => setCol(e.target.value)}
          className="config-input"
        />
        <select
          value={dtype}
          onChange={(e) => setDtype(e.target.value)}
          className="config-input config-input--select"
        >
          {DTYPE_OPTIONS.map((dt) => (
            <option key={dt} value={dt}>
              {dt}
            </option>
          ))}
        </select>
        <button type="button" onClick={addRule} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function DeriveForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const columns = (cfg.columns as Record<string, string>) || {};
  const [alias, setAlias] = useState('');
  const [expr, setExpr] = useState('');

  const addColumn = () => {
    if (!alias.trim() || !expr.trim()) return;
    onChange({
      columns: {
        ...columns,
        [alias.trim()]: expr.trim(),
      },
    });
    setAlias('');
    setExpr('');
  };

  const removeColumn = (k: string) => {
    const next = { ...columns };
    delete next[k];
    onChange({ columns: next });
  };

  return (
    <div className="config-field">
      <label>Derived Computed Columns</label>
      <div className="config-keyvalue-list">
        {Object.entries(columns).map(([k, expression]) => (
          <div key={k} className="config-keyvalue-row">
            <span className="config-keyvalue-key">{k}</span>
            <span className="text-muted">=</span>
            <span className="config-keyvalue-val config-font-mono">{expression}</span>
            <button
              type="button"
              onClick={() => removeColumn(k)}
              className="config-item-remove"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="config-inline-add-col">
        <input
          type="text"
          placeholder="New column name (e.g. tax_amount)"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          className="config-input"
        />
        <input
          type="text"
          placeholder="Expression: col('price') * 0.18"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          className="config-input config-font-mono"
        />
        <button type="button" onClick={addColumn} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
      <span className="config-helper-text">
        Polars expression syntax: <code>{"col('col_name')"}</code>, <code>lit(10)</code>, <code>{'${variable}'}</code>.
      </span>
    </div>
  );
}

function DropNullsForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const subset = (cfg.subset as string[]) || [];
  const [colInput, setColInput] = useState('');

  const addCol = () => {
    if (!colInput.trim() || subset.includes(colInput.trim())) return;
    onChange({ subset: [...subset, colInput.trim()] });
    setColInput('');
  };

  const removeCol = (col: string) => {
    onChange({ subset: subset.filter((c) => c !== col) });
  };

  return (
    <div className="config-field">
      <label>Target Columns (Optional — leave empty for all columns)</label>
      <div className="config-tags">
        {subset.map((col) => (
          <span key={col} className="config-tag">
            {col}
            <button type="button" onClick={() => removeCol(col)}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="config-inline-add">
        <input
          type="text"
          placeholder="Column name"
          value={colInput}
          onChange={(e) => setColInput(e.target.value)}
          className="config-input"
        />
        <button type="button" onClick={addCol} className="config-btn-sm">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function UniqueForm({
  cfg,
  onChange,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
}) {
  const subset = (cfg.subset as string[]) || [];
  const keep = (cfg.keep as string) || 'first';
  const [colInput, setColInput] = useState('');

  const addCol = () => {
    if (!colInput.trim() || subset.includes(colInput.trim())) return;
    onChange({ subset: [...subset, colInput.trim()], keep });
    setColInput('');
  };

  const removeCol = (col: string) => {
    onChange({ subset: subset.filter((c) => c !== col), keep });
  };

  return (
    <>
      <div className="config-field">
        <label>Keep Strategy</label>
        <select
          value={keep}
          onChange={(e) => onChange({ subset, keep: e.target.value })}
          className="config-input config-input--select"
        >
          <option value="first">Keep First Occurrence</option>
          <option value="last">Keep Last Occurrence</option>
          <option value="any">Keep Any</option>
          <option value="none">Drop All Duplicates</option>
        </select>
      </div>

      <div className="config-field">
        <label>Deduplication Column Subset (Optional)</label>
        <div className="config-tags">
          {subset.map((col) => (
            <span key={col} className="config-tag">
              {col}
              <button type="button" onClick={() => removeCol(col)}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="config-inline-add">
          <input
            type="text"
            placeholder="Column name"
            value={colInput}
            onChange={(e) => setColInput(e.target.value)}
            className="config-input"
          />
          <button type="button" onClick={addCol} className="config-btn-sm">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
    </>
  );
}

function JoinForm({
  cfg,
  onChange,
  otherStageIds,
}: {
  cfg: Record<string, unknown>;
  onChange: (u: Record<string, unknown>) => void;
  otherStageIds: string[];
}) {
  const rightStage = (cfg.right_stage as string) || '';
  const how = (cfg.how as JoinHow) || 'inner';
  const on = (cfg.on as string[]) || [];
  const [onCol, setOnCol] = useState('');

  const addOnCol = () => {
    if (!onCol.trim() || on.includes(onCol.trim())) return;
    onChange({ right_stage: rightStage, how, on: [...on, onCol.trim()] });
    setOnCol('');
  };

  const removeOnCol = (col: string) => {
    onChange({ right_stage: rightStage, how, on: on.filter((c) => c !== col) });
  };

  return (
    <>
      <div className="config-field">
        <label>Right Stage to Join With</label>
        <select
          value={rightStage}
          onChange={(e) => onChange({ ...cfg, right_stage: e.target.value })}
          className="config-input config-input--select"
        >
          <option value="">-- Select Right Stage --</option>
          {otherStageIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label>Join Strategy (How)</label>
        <select
          value={how}
          onChange={(e) => onChange({ ...cfg, how: e.target.value as JoinHow })}
          className="config-input config-input--select"
        >
          <option value="inner">Inner Join</option>
          <option value="left">Left Outer Join</option>
          <option value="right">Right Outer Join</option>
          <option value="outer">Full Outer Join</option>
          <option value="cross">Cross Join</option>
        </select>
      </div>

      <div className="config-field">
        <label>Join Key Columns (on)</label>
        <div className="config-tags">
          {on.map((col) => (
            <span key={col} className="config-tag">
              {col}
              <button type="button" onClick={() => removeOnCol(col)}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="config-inline-add">
          <input
            type="text"
            placeholder="Key column (e.g. id)"
            value={onCol}
            onChange={(e) => setOnCol(e.target.value)}
            className="config-input"
          />
          <button type="button" onClick={addOnCol} className="config-btn-sm">
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Load Fields
// ---------------------------------------------------------------------------

function LoadFields({
  stage,
  onUpdate,
}: {
  stage: StageConfig;
  onUpdate: (u: Partial<StageConfig>) => void;
}) {
  const cfg = stage.load_config || { path: '' };

  const updateCfg = (updates: Record<string, unknown>) => {
    onUpdate({ load_config: { ...cfg, ...updates } as StageConfig['load_config'] });
  };

  return (
    <div className="config-section">
      <div className="config-field">
        <label>Sink Type</label>
        <select
          value={stage.sink || 'csv'}
          onChange={(e) => onUpdate({ sink: e.target.value as StageConfig['sink'] })}
          className="config-input config-input--select"
        >
          <option value="csv">CSV File</option>
          <option value="json">JSON File</option>
          <option value="parquet">Parquet File</option>
        </select>
      </div>

      <div className="config-field">
        <label>Output Path</label>
        <input
          type="text"
          value={cfg.path || ''}
          onChange={(e) => updateCfg({ path: e.target.value })}
          placeholder="./output/results.csv or ./output/${filename}.parquet"
          className="config-input"
        />
      </div>

      {stage.sink === 'parquet' && (
        <div className="config-field">
          <label>Compression Codec</label>
          <select
            value={cfg.compression || 'snappy'}
            onChange={(e) => updateCfg({ compression: e.target.value })}
            className="config-input config-input--select"
          >
            <option value="snappy">Snappy (Fast, Default)</option>
            <option value="gzip">Gzip (Maximum Compression)</option>
            <option value="lz4">LZ4</option>
            <option value="zstd">Zstandard</option>
            <option value="none">None (Uncompressed)</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DTYPE_OPTIONS = [
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'Float32',
  'Float64',
  'Utf8',
  'String',
  'Boolean',
  'Date',
  'Datetime',
];

const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq', label: '== equals' },
  { value: 'ne', label: '!= not equals' },
  { value: 'gt', label: '> greater than' },
  { value: 'gte', label: '>= greater or equal' },
  { value: 'lt', label: '< less than' },
  { value: 'lte', label: '<= less or equal' },
  { value: 'contains', label: 'contains substring' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' },
  { value: 'in', label: 'is in list' },
  { value: 'not_in', label: 'is not in list' },
];
