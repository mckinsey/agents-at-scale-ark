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
      className="border-border bg-card text-card-foreground dark:border-border dark:bg-card dark:text-card-foreground flex items-center justify-center rounded-md border-2 px-2 py-2 text-xs font-medium"
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
        stroke: '#6b7280',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.Arrow,
        color: '#6b7280',
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
      <div className="bg-muted text-destructive rounded-lg p-4 text-sm">
        {error}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground rounded-lg p-4 text-sm">
        No tasks found in DAG
      </div>
    );
  }

  return (
    <div
      className={
        fill
          ? 'h-full w-full bg-transparent'
          : 'bg-muted h-[500px] w-full rounded-lg border'
      }>
      <style jsx global>{`
        .react-flow__controls {
          background: hsl(var(--card)) !important;
          border: 1px solid hsl(var(--border)) !important;
        }
        .react-flow__controls button {
          background: hsl(var(--card)) !important;
          background-color: hsl(var(--card)) !important;
          border-bottom: 1px solid hsl(var(--border)) !important;
          color: hsl(var(--foreground)) !important;
        }
        .react-flow__controls button:hover {
          background: hsl(var(--accent)) !important;
          background-color: hsl(var(--accent)) !important;
        }
        .react-flow__controls button svg,
        .react-flow__controls button path {
          fill: currentColor !important;
        }
        .dark .react-flow__attribution {
          background: hsl(var(--card));
          color: hsl(var(--muted-foreground));
          border: 1px solid hsl(var(--border));
          padding: 2px 6px;
          border-radius: 4px;
        }
        .dark .react-flow__attribution a {
          color: hsl(var(--foreground));
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right">
        <Background />
        <Controls className="!bg-card" />
      </ReactFlow>
    </div>
  );
}
