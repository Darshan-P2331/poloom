/**
 * Variables Manager panel — configure reusable pipeline variables.
 */

import { useState } from 'react';
import { Plus, Trash2, Copy, Check, Sparkles, Variable as VariableIcon } from 'lucide-react';
import type { UsePipelineSyncReturn } from '../hooks/usePipelineSync';

interface VariablesPanelProps {
  sync: UsePipelineSyncReturn;
}

type VarType = 'string' | 'number' | 'boolean' | 'json';

export function VariablesPanel({ sync }: VariablesPanelProps) {
  const { metadata, updateMetadata } = sync;
  const variables = metadata.variables || {};

  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<VarType>('string');
  const [newValue, setNewValue] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;

    let parsedValue: unknown = newValue;
    if (newType === 'number') {
      parsedValue = Number(newValue) || 0;
    } else if (newType === 'boolean') {
      parsedValue = newValue.toLowerCase() === 'true';
    } else if (newType === 'json') {
      try {
        parsedValue = JSON.parse(newValue);
      } catch {
        parsedValue = newValue;
      }
    }

    const updated = {
      ...variables,
      [trimmedKey]: parsedValue,
    };

    updateMetadata({ variables: updated });
    setNewKey('');
    setNewValue('');
  };

  const handleUpdateValue = (key: string, rawVal: string, type: VarType) => {
    let parsedValue: unknown = rawVal;
    if (type === 'number') {
      parsedValue = Number(rawVal) || 0;
    } else if (type === 'boolean') {
      parsedValue = rawVal.toLowerCase() === 'true';
    }

    const updated = {
      ...variables,
      [key]: parsedValue,
    };
    updateMetadata({ variables: updated });
  };

  const handleDeleteVariable = (key: string) => {
    const updated = { ...variables };
    delete updated[key];
    updateMetadata({ variables: updated });
  };

  const handleCopyTag = (key: string) => {
    navigator.clipboard.writeText(`\${${key}}`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const varEntries = Object.entries(variables);

  return (
    <div className="variables-panel">
      <div className="variables-panel__header">
        <div className="variables-panel__title">
          <VariableIcon size={16} />
          <h3>Pipeline Variables</h3>
        </div>
        <span className="variables-badge">{varEntries.length} configured</span>
      </div>

      <div className="variables-panel__body">
        <div className="variables-hint">
          <Sparkles size={14} className="variables-hint__icon" />
          <span>
            Use <code>{'${var_name}'}</code> in stage file paths, filter values, derive expressions, and parameters across the entire DAG.
          </span>
        </div>

        {/* Add new variable form */}
        <form onSubmit={handleAddVariable} className="variables-form">
          <div className="variables-form__inputs">
            <input
              type="text"
              placeholder="Variable name (e.g. min_rev)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="config-input"
              pattern="^[a-zA-Z_][a-zA-Z0-9_]*$"
              required
            />
            <div className="variables-form__row">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as VarType)}
                className="config-input config-input--select"
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="json">JSON</option>
              </select>

              {newType === 'boolean' ? (
                <select
                  value={newValue || 'true'}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="config-input"
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <input
                  type={newType === 'number' ? 'number' : 'text'}
                  placeholder="Value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="config-input"
                  required
                />
              )}
            </div>
          </div>
          <button type="submit" className="variables-add-btn">
            <Plus size={14} /> Add Variable
          </button>
        </form>

        {/* Variables list */}
        <div className="variables-list">
          {varEntries.length === 0 ? (
            <div className="variables-empty">
              <p>No variables created yet</p>
              <span>Define reusable parameters like thresholds, file path prefixes, or active regions above.</span>
            </div>
          ) : (
            varEntries.map(([key, val]) => {
              const valType = typeof val;
              return (
                <div key={key} className="variable-card">
                  <div className="variable-card__header">
                    <div className="variable-card__key">
                      <span className="variable-card__name">{key}</span>
                      <span className={`variable-type-tag variable-type-tag--${valType}`}>
                        {valType}
                      </span>
                    </div>
                    <div className="variable-card__actions">
                      <button
                        type="button"
                        onClick={() => handleCopyTag(key)}
                        className="variable-btn"
                        title="Copy variable placeholder"
                      >
                        {copiedKey === key ? (
                          <Check size={12} className="text-success" />
                        ) : (
                          <Copy size={12} />
                        )}
                        <span className="variable-copy-label">
                          {copiedKey === key ? 'Copied!' : `\${${key}}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVariable(key)}
                        className="variable-btn variable-btn--danger"
                        title="Delete variable"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="variable-card__input-wrap">
                    <input
                      type={valType === 'number' ? 'number' : 'text'}
                      value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      onChange={(e) =>
                        handleUpdateValue(
                          key,
                          e.target.value,
                          valType === 'number' ? 'number' : valType === 'boolean' ? 'boolean' : 'string',
                        )
                      }
                      className="config-input variable-value-input"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
