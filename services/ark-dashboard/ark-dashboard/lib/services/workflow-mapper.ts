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

function mapArgoNodeToStep(
  node: ArgoNodeStatus,
  allNodes: Record<string, ArgoNodeStatus>,
  workflowName: string,
  workflowNamespace?: string,
  visitedNodes: Set<string> = new Set(),
  parentIsDag = false,
  inBoundedContext = false,
): MappedWorkflowStep | null {
  if (visitedNodes.has(node.id)) {
    return null;
  }
  visitedNodes.add(node.id);

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
    detail: buildNodeDetail(node, workflowName, workflowNamespace),
  };

  if (node.type === 'DAG') {
    const retryAttemptIds = collectRetryAttemptIds(allNodes);
    const dagTaskIds = Object.keys(allNodes).filter(
      nodeId =>
        allNodes[nodeId].boundaryID === node.id &&
        nodeId !== node.id &&
        !retryAttemptIds.has(nodeId) &&
        !isStepGroupNode(allNodes[nodeId]),
    );

    const dagChildren = dagTaskIds
      .map(taskId => {
        const taskNode = allNodes[taskId];
        if (!taskNode) return null;

        return mapArgoNodeToStep(
          taskNode,
          allNodes,
          workflowName,
          workflowNamespace,
          visitedNodes,
          true,
          false,
        );
      })
      .filter((child): child is MappedWorkflowStep => child !== null)
      .sort((a, b) => {
        if (!a.startedAt || !b.startedAt) return 0;
        return a.startedAt.localeCompare(b.startedAt);
      });

    if (dagChildren.length > 0) {
      step.children = dagChildren;
    }
  } else if (node.children && node.children.length > 0) {
    if (node.type === 'Steps') {
      const firstChild = allNodes[node.children[0]];
      if (firstChild && isStepGroupNode(firstChild)) {
        const visitedStepGroups = new Set<string>();
        const stepsChildren = processStepGroup(
          firstChild,
          allNodes,
          workflowName,
          workflowNamespace,
          visitedStepGroups,
          visitedNodes,
          node.id,
        );
        if (stepsChildren.length > 0) {
          step.children = stepsChildren;
        }
      }
    } else if (node.type === 'Retry') {
      const attempts = node.children
        .map(attemptId => {
          const attemptNode = allNodes[attemptId];
          if (!attemptNode) return null;

          return mapArgoNodeToStep(
            attemptNode,
            allNodes,
            workflowName,
            workflowNamespace,
            visitedNodes,
            false,
            true,
          );
        })
        .filter((attempt): attempt is MappedWorkflowStep => attempt !== null);

      if (attempts.length > 0) {
        step.children = attempts;
      }
    } else if (!parentIsDag && !inBoundedContext) {
      const childSteps = node.children
        .map(childId => {
          const childNode = allNodes[childId];
          if (!childNode) return null;

          if (isStepGroupNode(childNode)) {
            return null;
          }

          return mapArgoNodeToStep(
            childNode,
            allNodes,
            workflowName,
            workflowNamespace,
            visitedNodes,
            false,
            inBoundedContext,
          );
        })
        .filter((child): child is MappedWorkflowStep => child !== null);

      if (childSteps.length > 0) {
        step.children = childSteps;
      }
    }
  }

  return step;
}

function processStepGroup(
  stepGroupNode: ArgoNodeStatus,
  allNodes: Record<string, ArgoNodeStatus>,
  workflowName: string,
  workflowNamespace?: string,
  visitedStepGroups: Set<string> = new Set(),
  visitedNodes: Set<string> = new Set(),
  boundaryId?: string,
): MappedWorkflowStep[] {
  if (visitedStepGroups.has(stepGroupNode.id)) {
    return [];
  }
  visitedStepGroups.add(stepGroupNode.id);

  if (!stepGroupNode.children || stepGroupNode.children.length === 0) {
    return [];
  }

  const result: MappedWorkflowStep[] = [];

  const isParallel = stepGroupNode.children.length > 1;

  if (isParallel) {
    const parallelSteps: MappedWorkflowStep[] = [];

    for (const childId of stepGroupNode.children) {
      const childNode = allNodes[childId];
      if (!childNode) continue;

      const mappedStep = mapArgoNodeToStep(
        childNode,
        allNodes,
        workflowName,
        workflowNamespace,
        visitedNodes,
        false,
        !!boundaryId,
      );
      if (mappedStep) {
        parallelSteps.push(mappedStep);
      }
    }

    if (parallelSteps.length > 0) {
      // Create a container that will show the parallel steps as nested
      const parallelContainer: MappedWorkflowStep = {
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
      };
      result.push(parallelContainer);
    }

    // Continue with the next StepGroup (check boundary inside)
    const parallelContinuations = stepGroupNode.children.flatMap(childId => {
      const child = allNodes[childId];
      return child ? resolveContinuationNodes(child, allNodes) : [];
    });
    const nextAfterParallel = findNextStepGroup(
      parallelContinuations,
      allNodes,
      visitedStepGroups,
      boundaryId,
    );
    if (nextAfterParallel) {
      result.push(
        ...processStepGroup(
          nextAfterParallel,
          allNodes,
          workflowName,
          workflowNamespace,
          visitedStepGroups,
          visitedNodes,
          boundaryId,
        ),
      );
    }
  } else {
    // Sequential execution: process single child and continue
    const childNode = allNodes[stepGroupNode.children[0]];
    if (childNode) {
      const mappedStep = mapArgoNodeToStep(
        childNode,
        allNodes,
        workflowName,
        workflowNamespace,
        visitedNodes,
        false,
        !!boundaryId,
      );
      if (mappedStep) {
        result.push(mappedStep);
      }

      // Continue with next StepGroups only if not already processed
      const nextStepGroup = findNextStepGroup(
        resolveContinuationNodes(childNode, allNodes),
        allNodes,
        visitedStepGroups,
        boundaryId,
      );
      if (nextStepGroup) {
        result.push(
          ...processStepGroup(
            nextStepGroup,
            allNodes,
            workflowName,
            workflowNamespace,
            visitedStepGroups,
            visitedNodes,
            boundaryId,
          ),
        );
      }
    }
  }

  return result;
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
      const visitedNodes = new Set<string>();
      const mappedRootStep = mapArgoNodeToStep(
        rootNode,
        nodes,
        workflowName,
        workflowNamespace,
        visitedNodes,
        false,
        false,
      );
      if (mappedRootStep && mappedRootStep.children) {
        steps = mappedRootStep.children;
      }
    } else {
      const visitedStepGroups = new Set<string>();
      const visitedNodes = new Set<string>();
      for (const childId of rootNode.children) {
        const childNode = nodes[childId];
        if (childNode && isStepGroupNode(childNode)) {
          steps = processStepGroup(
            childNode,
            nodes,
            workflowName,
            workflowNamespace,
            visitedStepGroups,
            visitedNodes,
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

    const visitedNodes = new Set<string>();
    for (const node of topLevelNodes) {
      const mappedStep = mapArgoNodeToStep(
        node,
        nodes,
        workflowName,
        workflowNamespace,
        visitedNodes,
        false,
        false,
      );
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
