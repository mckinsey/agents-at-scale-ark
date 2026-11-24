import dagre from 'dagre';
import yaml from 'js-yaml';

export interface DagTask {
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
      depends?: string;
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

export interface DagLayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DagLayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface DagLayout {
  nodes: DagLayoutNode[];
  edges: DagLayoutEdge[];
}

export interface DagLayoutError {
  error: string;
}

export const minNodeWidth = 120;
export const maxNodeWidth = 400;
export const nodeHeight = 40;
const charWidth = 6.5;

export function calculateNodeWidth(label: string): number {
  const padding = 24;
  const calculatedWidth = label.length * charWidth + padding;
  return Math.min(Math.max(calculatedWidth, minNodeWidth), maxNodeWidth);
}

function getLayoutedElements(tasks: DagTask[]): DagLayout {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });

  const nodes: DagLayoutNode[] = tasks.map(task => {
    const width = calculateNodeWidth(task.name);
    return {
      id: task.name,
      label: task.name,
      x: 0,
      y: 0,
      width,
      height: nodeHeight,
    };
  });

  const edges: DagLayoutEdge[] = [];
  tasks.forEach(task => {
    if (task.dependencies) {
      task.dependencies.forEach(dep => {
        edges.push({
          id: `${dep}-${task.name}`,
          source: dep,
          target: task.name,
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
    node.x = nodeWithPosition.x - width / 2;
    node.y = nodeWithPosition.y - nodeHeight / 2;
  });

  return { nodes, edges };
}

interface ExpandResult {
  tasks: DagTask[];
  entryNodes: string[];
  exitNodes: string[];
}

function parseDependencies(
  depends: string | undefined,
  dependencies: string[] | undefined,
): string[] {
  if (dependencies && dependencies.length > 0) {
    return dependencies;
  }
  if (!depends) return [];
  return depends
    .split('&&')
    .flatMap(part => part.split('||'))
    .map(dep => dep.trim())
    .filter(dep => dep.length > 0);
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

    const tasksWithoutDeps = template.dag.tasks.filter(t => {
      const deps = parseDependencies(t.depends, t.dependencies);
      return deps.length === 0;
    });
    tasksWithoutDeps.forEach(task => {
      const expansion = taskExpansions.get(task.name)!;
      entryNodes.push(...expansion.entryNodes);
    });

    const allDepTasks = new Set(
      template.dag.tasks.flatMap(t =>
        parseDependencies(t.depends, t.dependencies),
      ),
    );
    const tasksNotDependedOn = template.dag.tasks.filter(
      t => !allDepTasks.has(t.name),
    );
    tasksNotDependedOn.forEach(task => {
      const expansion = taskExpansions.get(task.name)!;
      exitNodes.push(...expansion.exitNodes);
    });

    template.dag.tasks.forEach(task => {
      const deps = parseDependencies(task.depends, task.dependencies);
      if (deps.length > 0) {
        const targetExpansion = taskExpansions.get(task.name)!;
        const depExitNodes: string[] = [];

        deps.forEach(depTaskName => {
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
      exitNodes = (stepExpansions.at(-1) ?? []).flatMap(
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

export function buildWorkflowDag(manifest: string): DagLayout | DagLayoutError {
  try {
    const parsed = yaml.load(manifest) as WorkflowManifest;

    if (!parsed?.spec?.templates) {
      return { error: 'No templates found in workflow manifest' };
    }

    const entrypoint =
      parsed.spec.entrypoint ||
      parsed.spec.templates.find(t => t.dag?.tasks)?.name ||
      parsed.spec.templates.find(t => t.steps)?.name;

    if (!entrypoint) {
      return { error: 'No entrypoint, DAG, or steps found in workflow' };
    }

    const expansion = expandTemplate(entrypoint, parsed.spec.templates);

    if (expansion.tasks.length === 0) {
      return { error: 'No tasks found after expanding templates' };
    }

    return getLayoutedElements(expansion.tasks);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to parse workflow manifest',
    };
  }
}
