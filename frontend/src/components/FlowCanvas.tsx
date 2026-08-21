/**
 * React Flow canvas with drag-and-drop from palette, custom nodes, and animated edges.
 */

import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { StageNode } from './FlowNodes';
import type { StageType } from '../types/pipeline';
import type { UsePipelineSyncReturn } from '../hooks/usePipelineSync';

const nodeTypes = { stageNode: StageNode };

interface FlowCanvasProps {
  sync: UsePipelineSyncReturn;
}

export function FlowCanvas({ sync }: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      sync.selectNode(node);
    },
    [sync],
  );

  const onPaneClick = useCallback(() => {
    sync.selectNode(null);
  }, [sync]);

  // Drag-and-drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/poloom-stage');
      if (!data) return;

      const { stageType, name } = JSON.parse(data) as {
        stageType: StageType;
        name: string;
      };

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const position = {
        x: e.clientX - (bounds?.left || 0) - 120,
        y: e.clientY - (bounds?.top || 0) - 40,
      };

      sync.addStage(stageType, name, position);
    },
    [sync],
  );

  return (
    <div className="flow-canvas" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={sync.nodes}
        edges={sync.edges}
        onNodesChange={sync.onNodesChange}
        onEdgesChange={sync.onEdgesChange}
        onConnect={sync.onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.05)"
        />
        <Controls
          className="flow-controls"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={(node) => (node.data?.color as string) || '#6366f1'}
          maskColor="rgba(15, 23, 42, 0.7)"
          className="flow-minimap"
        />
      </ReactFlow>

      {sync.nodes.length === 0 && (
        <div className="flow-canvas__empty">
          <p>Drag stages from the palette or click to add</p>
          <p className="flow-canvas__empty-sub">
            Connect stages by dragging between their handles
          </p>
        </div>
      )}
    </div>
  );
}
