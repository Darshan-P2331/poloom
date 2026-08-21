/**
 * Bidirectional sync between React Flow nodes/edges and PipelineConfig YAML.
 *
 * This hook is the core state manager — it keeps the visual canvas,
 * the YAML editor, and the stage config panel all in sync.
 */

import { useCallback, useRef, useState } from 'react';
import {
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import dagre from 'dagre';

import type {
  PipelineConfig,
  PipelineMetadata,
  StageConfig,
  StageType,
} from '../types/pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<StageType, string> = {
  extract: '#10b981',
  transform: '#3b82f6',
  load: '#a855f7',
};

function generateId(): string {
  return `stage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Map a StageTypeInfo name to an operation/source/sink value. */
function inferStageProps(
  stageType: StageType,
  name: string,
): Partial<StageConfig> {
  const lower = name.toLowerCase();

  if (stageType === 'extract') {
    if (lower.includes('csv')) return { source: 'csv', extract_config: { path: '' } };
    if (lower.includes('json')) return { source: 'json', extract_config: { path: '' } };
    if (lower.includes('parquet')) return { source: 'parquet', extract_config: { path: '' } };
    return { source: 'csv', extract_config: { path: '' } };
  }

  if (stageType === 'transform') {
    if (lower.includes('filter')) return { operation: 'filter', transform_config: { conditions: [], logic: 'and' } };
    if (lower.includes('select')) return { operation: 'select', transform_config: { columns: [] } };
    if (lower.includes('group')) return { operation: 'group_by', transform_config: { group_by: [], aggregations: [] } };
    if (lower.includes('sort')) return { operation: 'sort', transform_config: { by: [], descending: false } };
    if (lower.includes('rename')) return { operation: 'rename', transform_config: { mapping: {} } };
    if (lower.includes('cast')) return { operation: 'cast', transform_config: { mapping: {} } };
    if (lower.includes('derive')) return { operation: 'derive', transform_config: { columns: {} } };
    if (lower.includes('drop')) return { operation: 'drop_nulls', transform_config: {} };
    if (lower.includes('unique')) return { operation: 'unique', transform_config: { keep: 'first' } };
    if (lower.includes('join')) return { operation: 'join', transform_config: { right_stage: '', on: [], how: 'inner' } };
    return { operation: 'filter', transform_config: { conditions: [], logic: 'and' } };
  }

  if (stageType === 'load') {
    if (lower.includes('csv')) return { sink: 'csv', load_config: { path: '' } };
    if (lower.includes('json')) return { sink: 'json', load_config: { path: '' } };
    if (lower.includes('parquet')) return { sink: 'parquet', load_config: { path: '', compression: 'snappy' } };
    return { sink: 'csv', load_config: { path: '' } };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Auto-layout using dagre
// ---------------------------------------------------------------------------

function autoLayout(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 240, height: 80 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - 120,
        y: pos.y - 40,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Convert between pipeline config and React Flow
// ---------------------------------------------------------------------------

function configToFlow(
  config: PipelineConfig,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = config.stages.map((stage) => ({
    id: stage.id,
    type: 'stageNode',
    position: stage.position || { x: 0, y: 0 },
    data: {
      label: stage.label || stage.id,
      stageType: stage.type,
      stage,
      color: STAGE_COLORS[stage.type],
    },
  }));

  const edges: Edge[] = [];
  for (const stage of config.stages) {
    if (stage.depends_on) {
      for (const dep of stage.depends_on) {
        edges.push({
          id: `${dep}->${stage.id}`,
          source: dep,
          target: stage.id,
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        });
      }
    }
  }

  // Auto-layout if no positions stored
  const hasPositions = config.stages.some(
    (s) => s.position && (s.position.x !== 0 || s.position.y !== 0),
  );
  if (!hasPositions && nodes.length > 0) {
    return { nodes: autoLayout(nodes, edges), edges };
  }

  return { nodes, edges };
}

function flowToConfig(
  nodes: Node[],
  edges: Edge[],
  metadata: PipelineMetadata,
): PipelineConfig {
  const stages: StageConfig[] = nodes.map((node) => {
    const stage = node.data.stage as StageConfig;
    const deps = edges
      .filter((e) => e.target === node.id)
      .map((e) => e.source);

    return {
      ...stage,
      id: node.id,
      depends_on: deps.length > 0 ? deps : undefined,
      position: node.position,
      label: node.data.label as string,
    };
  });

  return { pipeline: metadata, stages };
}

function configToYaml(config: PipelineConfig): string {
  // Strip position/label from YAML output for cleanliness
  const cleaned = {
    ...config,
    stages: config.stages.map((s) => {
      const { position, label, ...rest } = s;
      // Remove empty depends_on
      if (rest.depends_on && rest.depends_on.length === 0) {
        delete rest.depends_on;
      }
      return rest;
    }),
  };
  return yamlDump(cleaned, { noRefs: true, sortKeys: false, lineWidth: 120 });
}

function yamlToConfig(yaml: string): PipelineConfig | null {
  try {
    const parsed = yamlLoad(yaml) as PipelineConfig;
    if (parsed && parsed.pipeline && parsed.stages) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UsePipelineSyncReturn {
  // State
  nodes: Node[];
  edges: Edge[];
  yamlText: string;
  metadata: PipelineMetadata;
  selectedNode: Node | null;
  pipelineId: string | null;

  // Node/edge handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // Actions
  addStage: (stageType: StageType, name: string, position?: { x: number; y: number }) => void;
  removeStage: (stageId: string) => void;
  updateStageConfig: (stageId: string, updates: Partial<StageConfig>) => void;
  selectNode: (node: Node | null) => void;
  updateYaml: (yaml: string) => void;
  updateMetadata: (meta: Partial<PipelineMetadata>) => void;
  loadFromConfig: (config: PipelineConfig, id?: string) => void;
  loadNewPipeline: () => void;
  getConfig: () => PipelineConfig;
  autoLayoutNodes: () => void;
  setPipelineId: (id: string | null) => void;
}

export function usePipelineSync(): UsePipelineSyncReturn {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [yamlText, setYamlText] = useState<string>('');
  const [metadata, setMetadata] = useState<PipelineMetadata>({
    name: 'new_pipeline',
    description: '',
    version: '1.0',
  });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  // Guard against infinite update loops
  const updatingFromYaml = useRef(false);
  const updatingFromFlow = useRef(false);

  // --- Sync flow → YAML ---
  const syncFlowToYaml = useCallback(
    (currentNodes: Node[], currentEdges: Edge[], meta: PipelineMetadata) => {
      if (updatingFromYaml.current) return;
      updatingFromFlow.current = true;
      const config = flowToConfig(currentNodes, currentEdges, meta);
      setYamlText(configToYaml(config));
      updatingFromFlow.current = false;
    },
    [],
  );

  // --- React Flow callbacks ---
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        // Debounce YAML sync for drag operations
        const hasDrag = changes.some((c) => c.type === 'position' && c.dragging);
        if (!hasDrag) {
          syncFlowToYaml(updated, edges, metadata);
        }
        return updated;
      });
    },
    [edges, metadata, syncFlowToYaml],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => {
        const updated = applyEdgeChanges(changes, eds);
        syncFlowToYaml(nodes, updated, metadata);
        return updated;
      });
    },
    [nodes, metadata, syncFlowToYaml],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) => {
        const updated = addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
          },
          eds,
        );
        syncFlowToYaml(nodes, updated, metadata);
        return updated;
      });
    },
    [nodes, metadata, syncFlowToYaml],
  );

  // --- Add / remove / update stages ---
  const addStage = useCallback(
    (stageType: StageType, name: string, position?: { x: number; y: number }) => {
      const id = generateId();
      const props = inferStageProps(stageType, name);
      const stage: StageConfig = {
        id,
        type: stageType,
        label: name,
        ...props,
      };
      const newNode: Node = {
        id,
        type: 'stageNode',
        position: position || { x: 250 + Math.random() * 100, y: 100 + nodes.length * 120 },
        data: {
          label: name,
          stageType,
          stage,
          color: STAGE_COLORS[stageType],
        },
      };
      setNodes((nds) => {
        const updated = [...nds, newNode];
        syncFlowToYaml(updated, edges, metadata);
        return updated;
      });
    },
    [nodes.length, edges, metadata, syncFlowToYaml],
  );

  const removeStage = useCallback(
    (stageId: string) => {
      setNodes((nds) => {
        const updated = nds.filter((n) => n.id !== stageId);
        setEdges((eds) => {
          const updatedEdges = eds.filter(
            (e) => e.source !== stageId && e.target !== stageId,
          );
          syncFlowToYaml(updated, updatedEdges, metadata);
          return updatedEdges;
        });
        return updated;
      });
      if (selectedNode?.id === stageId) {
        setSelectedNode(null);
      }
    },
    [metadata, selectedNode, syncFlowToYaml],
  );

  const updateStageConfig = useCallback(
    (stageId: string, updates: Partial<StageConfig>) => {
      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (n.id !== stageId) return n;
          const prevStage = (n.data.stage || {}) as StageConfig;
          const newStage: StageConfig = { ...prevStage, ...updates };
          return {
            ...n,
            data: {
              ...n.data,
              stage: newStage,
              label: updates.label || n.data.label,
            },
          };
        });
        syncFlowToYaml(updated, edges, metadata);
        return updated;
      });
    },
    [edges, metadata, syncFlowToYaml],
  );

  // --- YAML → Flow ---
  const updateYaml = useCallback(
    (yaml: string) => {
      setYamlText(yaml);
      if (updatingFromFlow.current) return;
      updatingFromYaml.current = true;

      const config = yamlToConfig(yaml);
      if (config) {
        setMetadata(config.pipeline);
        const { nodes: newNodes, edges: newEdges } = configToFlow(config);
        setNodes(newNodes);
        setEdges(newEdges);
      }

      updatingFromYaml.current = false;
    },
    [],
  );

  // --- Load / Reset ---
  const loadFromConfig = useCallback(
    (config: PipelineConfig, id?: string) => {
      setMetadata(config.pipeline);
      const { nodes: newNodes, edges: newEdges } = configToFlow(config);
      setNodes(newNodes);
      setEdges(newEdges);
      setYamlText(configToYaml(config));
      setPipelineId(id || null);
      setSelectedNode(null);
    },
    [],
  );

  const loadNewPipeline = useCallback(() => {
    const defaultMeta: PipelineMetadata = {
      name: 'new_pipeline',
      description: '',
      version: '1.0',
    };
    setMetadata(defaultMeta);
    setNodes([]);
    setEdges([]);
    setYamlText(configToYaml({ pipeline: defaultMeta, stages: [] }));
    setPipelineId(null);
    setSelectedNode(null);
  }, []);

  const getConfig = useCallback(
    () => flowToConfig(nodes, edges, metadata),
    [nodes, edges, metadata],
  );

  const autoLayoutNodes = useCallback(() => {
    setNodes((nds) => {
      const laid = autoLayout(nds, edges);
      syncFlowToYaml(laid, edges, metadata);
      return laid;
    });
  }, [edges, metadata, syncFlowToYaml]);

  const selectNode = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);

  const updateMetadata = useCallback(
    (meta: Partial<PipelineMetadata>) => {
      setMetadata((prev) => {
        const updated = { ...prev, ...meta };
        syncFlowToYaml(nodes, edges, updated);
        return updated;
      });
    },
    [nodes, edges, syncFlowToYaml],
  );

  return {
    nodes,
    edges,
    yamlText,
    metadata,
    selectedNode,
    pipelineId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addStage,
    removeStage,
    updateStageConfig,
    selectNode,
    updateYaml,
    updateMetadata,
    loadFromConfig,
    loadNewPipeline,
    getConfig,
    autoLayoutNodes,
    setPipelineId,
  };
}
