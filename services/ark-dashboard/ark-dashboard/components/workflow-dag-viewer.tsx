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

const minNodeWidth = 120;
const maxNodeWidth = 400;
const nodeHeight = 40;
const charWidth = 6.5;

function calculateNodeWidth(label: string): number {
  const padding = 24;
  const calculatedWidth = label.length * charWidth + padding;
  return Math.min(Math.max(calculatedWidth, minNodeWidth), maxNodeWidth);
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

function getLayoutedElements(tasks: DagTask[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });

  const nodes: Node[] = tasks.map(task => {
    const width = calculateNodeWidth(task.name);
    return {
      id: task.name,
      type: 'custom',
      data: { label: task.name, width },
      position: { x: 0, y: 0 },
      width,
    };
  });

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
            stroke: '#6b7280',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.Arrow,
            color: '#6b7280',
            width: 15,
            height: 15,
          },
        });
      });
    }
  });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, {
      width: node.width || minNodeWidth,
      height: nodeHeight,
    });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.width || minNodeWidth;
    node.position = {
      x: nodeWithPosition.x - width / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });

  return { nodes, edges };
}

interface ExpandResult {
  tasks: DagTask[];
  entryNodes: string[];
  exitNodes: string[];
}

function expandTemplate(
  templateName: string,
  templates: WorkflowTemplate[],
  prefix: string = '',
  visited: Set<string> = new Set(),
): ExpandResult {
  const fullName = prefix ? `${prefix}.${templateName}` : templateName;

  if (visited.has(fullName)) {
    return { tasks: [], entryNodes: [], exitNodes: [] };
  }
  visited.add(fullName);

  const template = templates.find(t => t.name === templateName);
  if (!template) {
    return {
      tasks: [
        {
          name: fullName,
          template: templateName,
          dependencies: [],
        },
      ],
      entryNodes: [fullName],
      exitNodes: [fullName],
    };
  }

  const expandedTasks: DagTask[] = [];
  let entryNodes: string[] = [];
  let exitNodes: string[] = [];

  if (template.dag?.tasks) {
    const taskExpansions = new Map<string, ExpandResult>();

    template.dag.tasks.forEach(task => {
      const taskFullName = prefix ? `${prefix}.${task.name}` : task.name;
      const expansion = expandTemplate(
        task.template,
        templates,
        taskFullName,
        visited,
      );
      taskExpansions.set(task.name, expansion);
      expandedTasks.push(...expansion.tasks);
    });

    const tasksWithoutDeps = template.dag.tasks.filter(
      t => !t.dependencies || t.dependencies.length === 0,
    );
    tasksWithoutDeps.forEach(task => {
      const expansion = taskExpansions.get(task.name)!;
      entryNodes.push(...expansion.entryNodes);
    });

    const allDepTasks = new Set(
      template.dag.tasks.flatMap(t => t.dependencies || []),
    );
    const tasksNotDependedOn = template.dag.tasks.filter(
      t => !allDepTasks.has(t.name),
    );
    tasksNotDependedOn.forEach(task => {
      const expansion = taskExpansions.get(task.name)!;
      exitNodes.push(...expansion.exitNodes);
    });

    template.dag.tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        const targetExpansion = taskExpansions.get(task.name)!;
        const depExitNodes: string[] = [];

        task.dependencies.forEach(depTaskName => {
          const depExpansion = taskExpansions.get(depTaskName);
          if (depExpansion) {
            depExitNodes.push(...depExpansion.exitNodes);
          }
        });

        targetExpansion.entryNodes.forEach(entryNode => {
          const taskObj = expandedTasks.find(t => t.name === entryNode);
          if (taskObj) {
            taskObj.dependencies = [
              ...(taskObj.dependencies || []),
              ...depExitNodes,
            ];
          }
        });
      }
    });
  } else if (template.steps) {
    const stepExpansions: ExpandResult[][] = [];

    template.steps.forEach((step, _stepIndex) => {
      const currentStepExpansions: ExpandResult[] = [];

      step.forEach(stepTask => {
        const stepTaskFullName = prefix
          ? `${prefix}.${stepTask.name}`
          : stepTask.name;
        const stepTaskTemplate = stepTask.template || stepTask.name;

        const expansion = expandTemplate(
          stepTaskTemplate,
          templates,
          stepTaskFullName,
          visited,
        );
        currentStepExpansions.push(expansion);
        expandedTasks.push(...expansion.tasks);
      });

      stepExpansions.push(currentStepExpansions);
    });

    if (stepExpansions.length > 0) {
      entryNodes = stepExpansions[0].flatMap(exp => exp.entryNodes);
      exitNodes = stepExpansions[stepExpansions.length - 1].flatMap(
        exp => exp.exitNodes,
      );
    }

    for (let i = 1; i < stepExpansions.length; i++) {
      const prevStepExitNodes = stepExpansions[i - 1].flatMap(
        exp => exp.exitNodes,
      );
      const currStepEntryNodes = stepExpansions[i].flatMap(
        exp => exp.entryNodes,
      );

      currStepEntryNodes.forEach(entryNode => {
        const taskObj = expandedTasks.find(t => t.name === entryNode);
        if (taskObj) {
          taskObj.dependencies = [
            ...(taskObj.dependencies || []),
            ...prevStepExitNodes,
          ];
        }
      });
    }
  } else {
    expandedTasks.push({
      name: fullName,
      template: templateName,
      dependencies: [],
    });
    entryNodes = [fullName];
    exitNodes = [fullName];
  }

  return { tasks: expandedTasks, entryNodes, exitNodes };
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

      const entrypoint =
        parsed.spec.entrypoint ||
        parsed.spec.templates.find(t => t.dag?.tasks)?.name ||
        parsed.spec.templates.find(t => t.steps)?.name;

      if (!entrypoint) {
        setError('No entrypoint, DAG, or steps found in workflow');
        return;
      }

      const expansion = expandTemplate(entrypoint, parsed.spec.templates);

      if (expansion.tasks.length === 0) {
        setError('No tasks found after expanding templates');
        return;
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(expansion.tasks);
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
    <div className="bg-muted h-[500px] w-full rounded-lg border">
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
