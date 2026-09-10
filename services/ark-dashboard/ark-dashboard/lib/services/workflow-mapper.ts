import type { ArgoNodeStatus, ArgoWorkflow } from '@/lib/types/argo-workflow';

import { calculateDuration, getAllNodesFlat } from './workflows';

export type MappedStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';
export type MappedWorkflowStepType =
  | 'dag'
  | 'steps'
  | 'retry'
  | 'container'
  | 'script'
  | 'suspend';

export interface MappedWorkflowStepDetail {
  image?: string;
  command?: string[];
  args?: string[];
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  exitCode?: number;
  resources?: {
    cpu?: string;
    memory?: string;
  };
  workflowName?: string;
  nodeId?: string;
  namespace?: string;
  podName?: string;
}

export interface MappedWorkflowStep {
  id: string;
  name: string;
  displayName: string;
  type: MappedWorkflowStepType;
  status: MappedStepStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  message?: string;
  detail?: MappedWorkflowStepDetail;
  children?: MappedWorkflowStep[];
}

export interface MappedWorkflowSession {
  id: string;
  name: string;
  type: 'workflow';
  status: MappedStepStatus;
  startedAt: string;
  finishedAt?: string;
  duration: string;
  steps: MappedWorkflowStep[];
  namespace?: string;
  uid?: string;
}

function mapArgoPhaseToStatus(phase: string): MappedStepStatus {
  switch (phase) {
    case 'Pending':
      return 'pending';
    case 'Running':
      return 'running';
    case 'Succeeded':
      return 'succeeded';
    case 'Failed':
    case 'Error':
      return 'failed';
    case 'Skipped':
      return 'skipped';
    default:
      return 'pending';
  }
}

function mapArgoTypeToWorkflowType(type: string): MappedWorkflowStepType {
  switch (type) {
    case 'DAG':
      return 'dag';
    case 'Steps':
      return 'steps';
    case 'Retry':
      return 'retry';
    case 'Pod':
      return 'container';
    case 'Container':
      return 'container';
    case 'Script':
      return 'script';
    case 'Suspend':
      return 'suspend';
    default:
      return 'container';
  }
}

function buildNodeDetail(
  node: ArgoNodeStatus,
  workflowName: string,
  workflowNamespace?: string,
): MappedWorkflowStepDetail | undefined {
  const detail: MappedWorkflowStepDetail = {};

  if (node.inputs?.parameters) {
    detail.inputs = {};
    for (const param of node.inputs.parameters) {
      detail.inputs[param.name] = param.value;
    }
  }

  if (node.outputs?.parameters) {
    detail.outputs = {};
    for (const param of node.outputs.parameters) {
      detail.outputs[param.name] = param.value;
    }
  }

  if (node.outputs?.exitCode) {
    detail.exitCode = parseInt(node.outputs.exitCode, 10);
  }

  if (node.resourcesDuration) {
    detail.resources = {};
    if (node.resourcesDuration.cpu !== undefined) {
      detail.resources.cpu = `${node.resourcesDuration.cpu}s`;
    }
    if (node.resourcesDuration.memory !== undefined) {
      detail.resources.memory = `${node.resourcesDuration.memory}Mi`;
    }
  }

  // For Pod-type nodes, store workflow and node info for log fetching
  if (node.type === 'Pod' && node.id) {
    detail.workflowName = workflowName;
    detail.nodeId = node.id;
    detail.namespace = workflowNamespace || 'default';

    if (node.podName) {
      detail.podName = node.podName;
    } else if (node.templateName && node.id) {
      const nodeIdParts = node.id.split('-');
      const suffix = nodeIdParts[nodeIdParts.length - 1];
      detail.podName = `${workflowName}-${node.templateName}-${suffix}`;
    }
  }

  return Object.keys(detail).length > 0 ? detail : undefined;
}

function isStepGroupNode(node: ArgoNodeStatus): boolean {
  return (
    node.type === 'StepGroup' || /^\[\d+\]$/.test(node.displayName || node.name)
  );
}

function collectRetryAttemptIds(
  allNodes: Record<string, ArgoNodeStatus>,
): Set<string> {
  const attemptIds = new Set<string>();

  for (const node of Object.values(allNodes)) {
    if (node.type !== 'Retry' || !node.children) {
      continue;
    }
    for (const attemptId of node.children) {
      attemptIds.add(attemptId);
    }
  }

  return attemptIds;
}

function resolveContinuationNodes(
  node: ArgoNodeStatus,
  allNodes: Record<string, ArgoNodeStatus>,
  seen: Set<string> = new Set(),
): ArgoNodeStatus[] {
  if (seen.has(node.id)) {
    return [];
  }
  seen.add(node.id);

  if (node.type !== 'Retry' && node.type !== 'DAG' && node.type !== 'Steps') {
    return [node];
  }

  const descendantIds =
    node.type === 'Retry' ? node.children : node.outboundNodes;

  return (descendantIds ?? []).flatMap(descendantId => {
    const descendant = allNodes[descendantId];
    return descendant
      ? resolveContinuationNodes(descendant, allNodes, seen)
      : [];
  });
}

function findNextStepGroup(
  candidates: ArgoNodeStatus[],
  allNodes: Record<string, ArgoNodeStatus>,
  visitedStepGroups: Set<string>,
  boundaryId?: string,
): ArgoNodeStatus | null {
  for (const candidate of candidates) {
    for (const childId of candidate.children ?? []) {
      const child = allNodes[childId];
      if (!child || !isStepGroupNode(child)) {
        continue;
      }
      if (boundaryId && child.boundaryID !== boundaryId) {
        break;
      }
      if (!visitedStepGroups.has(child.id)) {
        return child;
      }
    }
  }

  return null;
}

interface StepMappingContext {
  allNodes: Record<string, ArgoNodeStatus>;
  workflowName: string;
  workflowNamespace?: string;
  visitedNodes: Set<string>;
}

interface ChildMappingOptions {
  parentIsDag: boolean;
  inBoundedContext: boolean;
}

const ROOT_CHILD_OPTIONS: ChildMappingOptions = {
  parentIsDag: false,
  inBoundedContext: false,
};

function compareByStartedAt(
  a: MappedWorkflowStep,
  b: MappedWorkflowStep,
): number {
  if (!a.startedAt || !b.startedAt) {
    return 0;
  }
  return a.startedAt.localeCompare(b.startedAt);
}

function mapNodeIdsToSteps(
  nodeIds: string[],
  context: StepMappingContext,
  options: ChildMappingOptions,
): MappedWorkflowStep[] {
  const steps: MappedWorkflowStep[] = [];

  for (const nodeId of nodeIds) {
    const node = context.allNodes[nodeId];
    if (!node) {
      continue;
    }
    const step = mapArgoNodeToStep(node, context, options);
    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

function mapDagTasks(
  node: ArgoNodeStatus,
  context: StepMappingContext,
): MappedWorkflowStep[] {
  const retryAttemptIds = collectRetryAttemptIds(context.allNodes);
  const dagTaskIds = Object.keys(context.allNodes).filter(
    nodeId =>
      context.allNodes[nodeId].boundaryID === node.id &&
      nodeId !== node.id &&
      !retryAttemptIds.has(nodeId) &&
      !isStepGroupNode(context.allNodes[nodeId]),
  );

  return mapNodeIdsToSteps(dagTaskIds, context, {
    parentIsDag: true,
    inBoundedContext: false,
  }).sort(compareByStartedAt);
}

function mapStepsChildren(
  node: ArgoNodeStatus,
  context: StepMappingContext,
): MappedWorkflowStep[] {
  const firstChild = context.allNodes[(node.children ?? [])[0]];
  if (!firstChild || !isStepGroupNode(firstChild)) {
    return [];
  }

  return processStepGroup(firstChild, context, new Set<string>(), node.id);
}

function mapDirectChildren(
  node: ArgoNodeStatus,
  context: StepMappingContext,
): MappedWorkflowStep[] {
  const childIds = (node.children ?? []).filter(
    childId =>
      context.allNodes[childId] && !isStepGroupNode(context.allNodes[childId]),
  );

  return mapNodeIdsToSteps(childIds, context, ROOT_CHILD_OPTIONS);
}

function mapChildSteps(
  node: ArgoNodeStatus,
  context: StepMappingContext,
  options: ChildMappingOptions,
): MappedWorkflowStep[] {
  if (node.type === 'DAG') {
    return mapDagTasks(node, context);
  }

  if (!node.children || node.children.length === 0) {
    return [];
  }

  if (node.type === 'Steps') {
    return mapStepsChildren(node, context);
  }

  if (node.type === 'Retry') {
    return mapNodeIdsToSteps(node.children, context, {
      parentIsDag: false,
      inBoundedContext: true,
    });
  }

  if (options.parentIsDag || options.inBoundedContext) {
    return [];
  }

  return mapDirectChildren(node, context);
}

function mapArgoNodeToStep(
  node: ArgoNodeStatus,
  context: StepMappingContext,
  options: ChildMappingOptions = ROOT_CHILD_OPTIONS,
): MappedWorkflowStep | null {
  if (context.visitedNodes.has(node.id)) {
    return null;
  }
  context.visitedNodes.add(node.id);

  const step: MappedWorkflowStep = {
    id: node.id,
    name: node.name,
    displayName: node.displayName || node.name,
    type: mapArgoTypeToWorkflowType(node.type),
    status: mapArgoPhaseToStatus(node.phase),
    startedAt: node.startedAt,
    finishedAt: node.finishedAt,
    duration: calculateDuration(node.startedAt, node.finishedAt),
    message: node.message,
    detail: buildNodeDetail(
      node,
      context.workflowName,
      context.workflowNamespace,
    ),
  };

  const children = mapChildSteps(node, context, options);
  if (children.length > 0) {
    step.children = children;
  }

  return step;
}

function buildParallelGroup(
  stepGroupNode: ArgoNodeStatus,
  context: StepMappingContext,
  boundaryId?: string,
): MappedWorkflowStep[] {
  const parallelSteps = mapNodeIdsToSteps(
    stepGroupNode.children ?? [],
    context,
    {
      parentIsDag: false,
      inBoundedContext: !!boundaryId,
    },
  );

  if (parallelSteps.length === 0) {
    return [];
  }

  // Create a container that will show the parallel steps as nested
  return [
    {
      id: stepGroupNode.id,
      name: stepGroupNode.name,
      displayName: stepGroupNode.displayName || stepGroupNode.name,
      type: 'steps',
      status: mapArgoPhaseToStatus(stepGroupNode.phase),
      startedAt: stepGroupNode.startedAt,
      finishedAt: stepGroupNode.finishedAt,
      duration: calculateDuration(
        stepGroupNode.startedAt,
        stepGroupNode.finishedAt,
      ),
      children: parallelSteps,
    },
  ];
}

// Continue with the next StepGroup (check boundary inside)
function continueAfterStepGroup(
  childIds: string[],
  context: StepMappingContext,
  visitedStepGroups: Set<string>,
  boundaryId?: string,
): MappedWorkflowStep[] {
  const continuations = childIds.flatMap(childId => {
    const child = context.allNodes[childId];
    return child ? resolveContinuationNodes(child, context.allNodes) : [];
  });

  const nextStepGroup = findNextStepGroup(
    continuations,
    context.allNodes,
    visitedStepGroups,
    boundaryId,
  );

  if (!nextStepGroup) {
    return [];
  }

  return processStepGroup(
    nextStepGroup,
    context,
    visitedStepGroups,
    boundaryId,
  );
}

function processStepGroup(
  stepGroupNode: ArgoNodeStatus,
  context: StepMappingContext,
  visitedStepGroups: Set<string>,
  boundaryId?: string,
): MappedWorkflowStep[] {
  if (visitedStepGroups.has(stepGroupNode.id)) {
    return [];
  }
  visitedStepGroups.add(stepGroupNode.id);

  const childIds = stepGroupNode.children ?? [];
  if (childIds.length === 0) {
    return [];
  }

  const isParallel = childIds.length > 1;
  const steps = isParallel
    ? buildParallelGroup(stepGroupNode, context, boundaryId)
    : mapNodeIdsToSteps(childIds, context, {
        parentIsDag: false,
        inBoundedContext: !!boundaryId,
      });

  return [
    ...steps,
    ...continueAfterStepGroup(childIds, context, visitedStepGroups, boundaryId),
  ];
}

function createStepMappingContext(
  allNodes: Record<string, ArgoNodeStatus>,
  workflowName: string,
  workflowNamespace?: string,
): StepMappingContext {
  return {
    allNodes,
    workflowName,
    workflowNamespace,
    visitedNodes: new Set<string>(),
  };
}

export function mapArgoWorkflowToSession(
  workflow: ArgoWorkflow,
): MappedWorkflowSession {
  const workflowName = workflow.metadata.name;
  const rootNodeId = workflowName;
  const status = workflow.status;
  const nodes = status?.nodes || {};
  const rootNode = nodes[rootNodeId];
  const workflowNamespace = workflow.metadata.namespace;

  let steps: MappedWorkflowStep[] = [];

  if (rootNode && rootNode.children && rootNode.children.length > 0) {
    if (rootNode.type === 'DAG') {
      const mappedRootStep = mapArgoNodeToStep(
        rootNode,
        createStepMappingContext(nodes, workflowName, workflowNamespace),
      );
      if (mappedRootStep && mappedRootStep.children) {
        steps = mappedRootStep.children;
      }
    } else {
      const context = createStepMappingContext(
        nodes,
        workflowName,
        workflowNamespace,
      );
      const visitedStepGroups = new Set<string>();
      for (const childId of rootNode.children) {
        const childNode = nodes[childId];
        if (childNode && isStepGroupNode(childNode)) {
          steps = processStepGroup(
            childNode,
            context,
            visitedStepGroups,
            rootNode.id,
          );
          break;
        }
      }
    }
  } else {
    const allNodesFlat = getAllNodesFlat(nodes);
    const retryAttemptIds = collectRetryAttemptIds(nodes);
    const topLevelNodes = allNodesFlat.filter(
      node =>
        (!node.boundaryID || node.boundaryID === rootNodeId) &&
        !retryAttemptIds.has(node.id),
    );

    const context = createStepMappingContext(
      nodes,
      workflowName,
      workflowNamespace,
    );
    for (const node of topLevelNodes) {
      const mappedStep = mapArgoNodeToStep(node, context);
      if (mappedStep) {
        steps.push(mappedStep);
      }
    }
  }

  return {
    id: workflowName,
    name: workflowName,
    type: 'workflow',
    status: mapArgoPhaseToStatus(status?.phase ?? 'Pending'),
    startedAt: status?.startedAt || workflow.metadata.creationTimestamp,
    finishedAt: status?.finishedAt,
    duration: calculateDuration(status?.startedAt, status?.finishedAt),
    steps,
    namespace: workflow.metadata.namespace,
    uid: workflow.metadata.uid,
  };
}

export function mapArgoWorkflowsToSessions(
  workflows: ArgoWorkflow[],
): MappedWorkflowSession[] {
  return workflows.map(mapArgoWorkflowToSession);
}
