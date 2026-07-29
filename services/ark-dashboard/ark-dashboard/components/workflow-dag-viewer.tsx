'use client';

import type { Edge, Node } from '@xyflow/react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useState } from 'react';

import { buildWorkflowDag, nodeHeight } from '@/lib/utils/workflow-dag';

interface WorkflowDagViewerProps {
  manifest: string;
  fill?: boolean;
}

function CustomNode({ data }: { data: { label: string; width: number } }) {
  return (
    <div
      className="border-stroke-secondary bg-surface-primary text-fg-primary flex items-center justify-center border-2 px-2 py-2 text-xs font-medium"
      style={{
        width: data.width,
        height: nodeHeight,
      }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {data.label}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

export function WorkflowDagViewer({ manifest, fill }: WorkflowDagViewerProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const result = buildWorkflowDag(manifest);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    const layoutedNodes: Node[] = result.nodes.map(node => ({
      id: node.id,
      type: 'custom',
      data: { label: node.label, width: node.width },
      position: { x: node.x, y: node.y },
      width: node.width,
    }));

    const layoutedEdges: Edge[] = result.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: 'var(--color-fg-tertiary)',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.Arrow,
        color: 'var(--color-fg-tertiary)',
        width: 15,
        height: 15,
      },
    }));

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setError(null);
  }, [manifest]);

  if (error) {
    return (
      <div className="bg-fill-muted text-status-error p-4 text-sm">{error}</div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="bg-fill-muted text-fg-secondary p-4 text-sm">
        No tasks found in DAG
      </div>
    );
  }

  return (
    <div
      className={
        fill
          ? 'h-full w-full bg-transparent'
          : 'bg-fill-muted border-stroke-divider h-[500px] w-full border'
      }>
      <style jsx global>{`
        .react-flow__controls {
          background: var(--color-surface-primary) !important;
          border: 1px solid var(--color-stroke-divider) !important;
        }
        .react-flow__controls button {
          background: var(--color-surface-primary) !important;
          background-color: var(--color-surface-primary) !important;
          border-bottom: 1px solid var(--color-stroke-divider) !important;
          color: var(--color-fg-primary) !important;
        }
        .react-flow__controls button:hover {
          background: var(--color-fill-subtle) !important;
          background-color: var(--color-fill-subtle) !important;
        }
        .react-flow__controls button svg,
        .react-flow__controls button path {
          fill: currentColor !important;
        }
        .dark .react-flow__attribution {
          background: var(--color-surface-primary);
          color: var(--color-fg-secondary);
          border: 1px solid var(--color-stroke-divider);
          padding: 2px 6px;
          border-radius: 0;
        }
        .dark .react-flow__attribution a {
          color: var(--color-fg-primary);
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right">
        <Background />
        <Controls className="!bg-surface-primary" />
      </ReactFlow>
    </div>
  );
}
