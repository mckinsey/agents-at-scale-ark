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
import dagre from 'dagre';
import yaml from 'js-yaml';
import { useEffect, useState } from 'react';

interface WorkflowDagViewerProps {
  manifest: string;
}

interface DagTask {
  name: string;
  template: string;
  dependencies?: string[];
}

interface WorkflowTemplate {
  name?: string;
  dag?: {
    tasks: Array<{
      name: string;
      template: string;
      dependencies?: string[];
    }>;
  };
  steps?: Array<
    Array<{
      name: string;
      template?: string;
    }>
  >;
}

interface WorkflowManifest {
  spec?: {
    entrypoint?: string;
    templates?: WorkflowTemplate[];
  };
}

const nodeWidth = 180;
const nodeHeight = 40;

function CustomNode({ data }: { data: { label: string } }) {
  return (
    <div
      style={{
        width: nodeWidth,
        height: nodeHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #d1d5db',
        borderRadius: '6px',
        background: 'white',
        fontSize: '12px',
        fontWeight: 500,
        padding: '8px',
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

function getLayoutedElements(tasks: DagTask[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });

  const nodes: Node[] = tasks.map(task => ({
    id: task.name,
    type: 'custom',
    data: { label: task.name },
    position: { x: 0, y: 0 },
  }));

  const edges: Edge[] = [];
  tasks.forEach(task => {
    if (task.dependencies) {
      task.dependencies.forEach(dep => {
        edges.push({
          id: `${dep}-${task.name}`,
          source: dep,
          target: task.name,
          type: 'smoothstep',
          animated: true,
          style: {
            stroke: '#000000',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.Arrow,
            color: '#000000',
            width: 15,
            height: 15,
          },
        });
      });
    }
  });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  return { nodes, edges };
}

export function WorkflowDagViewer({ manifest }: WorkflowDagViewerProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed = yaml.load(manifest) as WorkflowManifest;

      if (!parsed.spec?.templates) {
        setError('No templates found in workflow manifest');
        return;
      }

      const dagTemplate = parsed.spec.templates.find(t => t.dag?.tasks);

      const stepsTemplate = parsed.spec.templates.find(t => t.steps);

      let tasks: DagTask[] = [];

      if (dagTemplate && dagTemplate.dag) {
        tasks = dagTemplate.dag.tasks.map(task => ({
          name: task.name,
          template: task.template,
          dependencies: task.dependencies || [],
        }));
      } else if (stepsTemplate && stepsTemplate.steps) {
        const allStepTasks: string[][] = stepsTemplate.steps.map(step => {
          return step.map(s => s.name);
        });

        const flatTasks: DagTask[] = [];
        allStepTasks.forEach((stepTasks, stepIndex) => {
          const previousStepTasks =
            stepIndex > 0 ? allStepTasks[stepIndex - 1] : [];

          stepTasks.forEach(taskName => {
            flatTasks.push({
              name: taskName,
              template: taskName,
              dependencies: previousStepTasks,
            });
          });
        });

        tasks = flatTasks;
      } else if (parsed.spec?.entrypoint) {
        tasks = [
          {
            name: parsed.spec.entrypoint,
            template: parsed.spec.entrypoint,
            dependencies: [],
          },
        ];
      } else {
        setError('No DAG, Steps, or entrypoint found in workflow');
        return;
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(tasks);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to parse workflow manifest',
      );
    }
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
    <div style={{ width: '100%', height: '500px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left">
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
