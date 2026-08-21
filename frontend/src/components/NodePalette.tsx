/**
 * Draggable node palette sidebar — organized by Extract / Transform / Load.
 */

import { useEffect, useState } from 'react';
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
  FileJson2,
  HardDrive,
  GripVertical,
} from 'lucide-react';

import { fetchStageTypes } from '../api/client';
import type { StageTypeInfo, StageType } from '../types/pipeline';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ReactNode> = {
  'file-spreadsheet': <FileSpreadsheet size={16} />,
  'file-json': <FileJson size={16} />,
  'database': <Database size={16} />,
  'filter': <Filter size={16} />,
  'columns-3': <Columns3 size={16} />,
  'group': <Group size={16} />,
  'arrow-up-down': <ArrowUpDown size={16} />,
  'pencil': <Pencil size={16} />,
  'shuffle': <Shuffle size={16} />,
  'calculator': <Calculator size={16} />,
  'trash-2': <Trash2 size={16} />,
  'fingerprint': <Fingerprint size={16} />,
  'merge': <Merge size={16} />,
  'file-output': <FileOutput size={16} />,
  'file-json-2': <FileJson2 size={16} />,
  'hard-drive': <HardDrive size={16} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  extract: '#10b981',
  transform: '#3b82f6',
  load: '#a855f7',
};

const CATEGORY_LABELS: Record<string, string> = {
  extract: 'EXTRACT',
  transform: 'TRANSFORM',
  load: 'LOAD',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NodePaletteProps {
  onAddStage: (stageType: StageType, name: string) => void;
}

export function NodePalette({ onAddStage }: NodePaletteProps) {
  const [stageTypes, setStageTypes] = useState<StageTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStageTypes()
      .then(setStageTypes)
      .catch(() => {
        // Fallback catalog if backend is unavailable
        setStageTypes(FALLBACK_CATALOG);
      })
      .finally(() => setLoading(false));
  }, []);

  const grouped = stageTypes.reduce(
    (acc, st) => {
      if (!acc[st.category]) acc[st.category] = [];
      acc[st.category].push(st);
      return acc;
    },
    {} as Record<string, StageTypeInfo[]>,
  );

  const onDragStart = (
    e: React.DragEvent,
    stageType: StageType,
    name: string,
  ) => {
    e.dataTransfer.setData('application/poloom-stage', JSON.stringify({ stageType, name }));
    e.dataTransfer.effectAllowed = 'move';
  };

  if (loading) {
    return (
      <aside className="node-palette">
        <h3 className="node-palette__title">Node Palette</h3>
        <div className="node-palette__loading">Loading…</div>
      </aside>
    );
  }

  return (
    <aside className="node-palette">
      <h3 className="node-palette__title">Node Palette</h3>
      {['extract', 'transform', 'load'].map((category) => (
        <div key={category} className="node-palette__category">
          <div
            className="node-palette__category-label"
            style={{ color: CATEGORY_COLORS[category] }}
          >
            {CATEGORY_LABELS[category]}
          </div>
          {(grouped[category] || []).map((st) => (
            <div
              key={st.name}
              className="node-palette__item"
              draggable
              onDragStart={(e) => onDragStart(e, st.type, st.name)}
              onClick={() => onAddStage(st.type, st.name)}
              style={{ '--item-color': CATEGORY_COLORS[category] } as React.CSSProperties}
            >
              <GripVertical size={12} className="node-palette__grip" />
              <span className="node-palette__icon" style={{ color: CATEGORY_COLORS[category] }}>
                {ICON_MAP[st.icon] || <Database size={16} />}
              </span>
              <span className="node-palette__name">{st.name}</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Fallback catalog when backend isn't reachable
// ---------------------------------------------------------------------------

const FALLBACK_CATALOG: StageTypeInfo[] = [
  { type: 'extract', category: 'extract', name: 'CSV Source', description: 'Read CSV', icon: 'file-spreadsheet', config_schema: {} },
  { type: 'extract', category: 'extract', name: 'JSON Source', description: 'Read JSON', icon: 'file-json', config_schema: {} },
  { type: 'extract', category: 'extract', name: 'Parquet Source', description: 'Read Parquet', icon: 'database', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Filter', description: 'Filter rows', icon: 'filter', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Select', description: 'Select columns', icon: 'columns-3', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Group By', description: 'Aggregate', icon: 'group', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Sort', description: 'Sort rows', icon: 'arrow-up-down', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Rename', description: 'Rename columns', icon: 'pencil', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Cast', description: 'Cast types', icon: 'shuffle', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Derive', description: 'Add columns', icon: 'calculator', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Drop Nulls', description: 'Remove nulls', icon: 'trash-2', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Unique', description: 'Deduplicate', icon: 'fingerprint', config_schema: {} },
  { type: 'transform', category: 'transform', name: 'Join', description: 'Join datasets', icon: 'merge', config_schema: {} },
  { type: 'load', category: 'load', name: 'CSV Output', description: 'Write CSV', icon: 'file-output', config_schema: {} },
  { type: 'load', category: 'load', name: 'JSON Output', description: 'Write JSON', icon: 'file-json-2', config_schema: {} },
  { type: 'load', category: 'load', name: 'Parquet Output', description: 'Write Parquet', icon: 'hard-drive', config_schema: {} },
];
