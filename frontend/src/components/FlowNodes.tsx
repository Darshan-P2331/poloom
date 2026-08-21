/**
 * Custom React Flow node for pipeline stages.
 * Color-coded by type: Extract (emerald), Transform (blue), Load (purple).
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  FileSpreadsheet,
  FileJson,
  Database,
  Filter,
  Columns3,
  Group,
  ArrowUpDown,
  Pencil,
  Shuffle,
  Calculator,
  Trash2,
  Fingerprint,
  Merge,
  FileOutput,
  HardDrive,
  FileJson2,
} from 'lucide-react';

import type { StageType, TransformOperation, ExtractSource, LoadSink } from '../types/pipeline';

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

const ICON_SIZE = 18;

function getStageIcon(
  stageType: StageType,
  operation?: TransformOperation,
  source?: ExtractSource,
  sink?: LoadSink,
) {
  if (stageType === 'extract') {
    switch (source) {
      case 'csv': return <FileSpreadsheet size={ICON_SIZE} />;
      case 'json': return <FileJson size={ICON_SIZE} />;
      case 'parquet': return <Database size={ICON_SIZE} />;
      default: return <FileSpreadsheet size={ICON_SIZE} />;
    }
  }

  if (stageType === 'transform') {
    switch (operation) {
      case 'filter': return <Filter size={ICON_SIZE} />;
      case 'select': return <Columns3 size={ICON_SIZE} />;
      case 'group_by': return <Group size={ICON_SIZE} />;
      case 'sort': return <ArrowUpDown size={ICON_SIZE} />;
      case 'rename': return <Pencil size={ICON_SIZE} />;
      case 'cast': return <Shuffle size={ICON_SIZE} />;
      case 'derive': return <Calculator size={ICON_SIZE} />;
      case 'drop_nulls': return <Trash2 size={ICON_SIZE} />;
      case 'unique': return <Fingerprint size={ICON_SIZE} />;
      case 'join': return <Merge size={ICON_SIZE} />;
      default: return <Filter size={ICON_SIZE} />;
    }
  }

  if (stageType === 'load') {
    switch (sink) {
      case 'csv': return <FileOutput size={ICON_SIZE} />;
      case 'json': return <FileJson2 size={ICON_SIZE} />;
      case 'parquet': return <HardDrive size={ICON_SIZE} />;
      default: return <FileOutput size={ICON_SIZE} />;
    }
  }

  return <Database size={ICON_SIZE} />;
}

const TYPE_LABELS: Record<StageType, string> = {
  extract: 'Extract',
  transform: 'Transform',
  load: 'Load',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function StageNodeComponent({ data, selected }: NodeProps) {
  const stageType = data.stageType as StageType;
  const stage = data.stage as Record<string, unknown>;
  const color = data.color as string;
  const label = data.label as string;

  return (
    <div
      className={`stage-node stage-node--${stageType}${selected ? ' stage-node--selected' : ''}`}
      style={{
        '--stage-color': color,
        borderColor: selected ? color : 'rgba(255,255,255,0.08)',
      } as React.CSSProperties}
    >
      {/* Input handle (not for extract nodes) */}
      {stageType !== 'extract' && (
        <Handle
          type="target"
          position={Position.Top}
          className="stage-handle"
          style={{ background: color }}
        />
      )}

      <div className="stage-node__header">
        <span className="stage-node__icon" style={{ color }}>
          {getStageIcon(
            stageType,
            stage.operation as TransformOperation,
            stage.source as ExtractSource,
            stage.sink as LoadSink,
          )}
        </span>
        <div className="stage-node__info">
          <span className="stage-node__label">{label}</span>
          <span className="stage-node__type">{TYPE_LABELS[stageType]}</span>
        </div>
      </div>

      {/* Output handle (not for load nodes) */}
      {stageType !== 'load' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="stage-handle"
          style={{ background: color }}
        />
      )}
    </div>
  );
}

export const StageNode = memo(StageNodeComponent);
