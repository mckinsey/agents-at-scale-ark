import type {
  ArgoWorkflow,
  ArgoNodeStatus,
} from '@/lib/types/argo-workflow';
import { calculateDuration, getAllNodesFlat } from './workflows';

export type MappedStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type MappedWorkflowStepType = 'dag' | 'steps' | 'container' | 'script' | 'suspend';

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
  }

  return Object.keys(detail).length > 0 ? detail : undefined;
}

function isStepGroupNode(node: ArgoNodeStatus): boolean {
  return node.type === 'StepGroup' || /^\[\d+\]$/.test(node.displayName || node.name);
}

function mapArgoNodeToStep(
  node: ArgoNodeStatus,
  allNodes: Record<string, ArgoNodeStatus>,
  workflowName: string,
  workflowNamespace?: string,
): MappedWorkflowStep {
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

  if (node.children && node.children.length > 0) {
    step.children = node.children
      .map(childId => {
        const childNode = allNodes[childId];
        if (!childNode) return null;
        
        if (isStepGroupNode(childNode)) {
          if (childNode.children && childNode.children.length > 0) {
            return childNode.children
              .map(grandchildId => {
                const grandchildNode = allNodes[grandchildId];
                return grandchildNode ? mapArgoNodeToStep(grandchildNode, allNodes, workflowName, workflowNamespace) : null;
              })
              .filter((grandchild): grandchild is MappedWorkflowStep => grandchild !== null);
          }
          return null;
        }
        
        return mapArgoNodeToStep(childNode, allNodes, workflowName, workflowNamespace);
      })
      .flat()
      .filter((child): child is MappedWorkflowStep => child !== null);
  }

  return step;
}

export function mapArgoWorkflowToSession(
  workflow: ArgoWorkflow,
): MappedWorkflowSession {
  const workflowName = workflow.metadata.name;
  const rootNodeId = workflowName;
  const nodes = workflow.status.nodes || {};
  const rootNode = nodes[rootNodeId];
  const workflowNamespace = workflow.metadata.namespace;

  const steps: MappedWorkflowStep[] = [];

  if (rootNode) {
    steps.push(mapArgoNodeToStep(rootNode, nodes, workflowName, workflowNamespace));
  } else {
    const allNodesFlat = getAllNodesFlat(nodes);
    const topLevelNodes = allNodesFlat.filter(
      node => !node.boundaryID || node.boundaryID === rootNodeId,
    );

    for (const node of topLevelNodes) {
      steps.push(mapArgoNodeToStep(node, nodes, workflowName, workflowNamespace));
    }
  }

  return {
    id: workflowName,
    name: workflowName,
    type: 'workflow',
    status: mapArgoPhaseToStatus(workflow.status.phase),
    startedAt: workflow.status.startedAt || workflow.metadata.creationTimestamp,
    finishedAt: workflow.status.finishedAt,
    duration: calculateDuration(
      workflow.status.startedAt,
      workflow.status.finishedAt,
    ),
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
