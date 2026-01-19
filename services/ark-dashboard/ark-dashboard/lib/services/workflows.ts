import { apiClient } from '@/lib/api/client';
import type {
  ArgoWorkflow,
  ArgoWorkflowList,
  ArgoNodeStatus,
} from '@/lib/types/argo-workflow';

export const workflowsService = {
  async list(namespace: string = 'default'): Promise<ArgoWorkflow[]> {
    const response = await apiClient.get<ArgoWorkflowList>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=${namespace}`,
    );
    return response.items;
  },

  async get(name: string, namespace: string = 'default'): Promise<ArgoWorkflow> {
    const response = await apiClient.get<ArgoWorkflow>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow/${name}?namespace=${namespace}`,
    );
    return response;
  },

  async getYaml(
    name: string,
    namespace: string = 'default',
  ): Promise<string> {
    const response = await apiClient.get<string>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow/${name}?namespace=${namespace}`,
      {
        headers: {
          Accept: 'application/yaml',
        },
      },
    );
    return response;
  },
};

export function buildNodeHierarchy(
  nodes: Record<string, ArgoNodeStatus>,
  rootNodeId: string,
): ArgoNodeStatus | null {
  const node = nodes[rootNodeId];
  if (!node) return null;

  const nodeWithChildren = { ...node };

  if (node.children && node.children.length > 0) {
    const childNodes = node.children
      .map(childId => buildNodeHierarchy(nodes, childId))
      .filter((child): child is ArgoNodeStatus => child !== null);

    if (childNodes.length > 0) {
      nodeWithChildren.children = childNodes.map(child => child.id);
    }
  }

  return nodeWithChildren;
}

export function getAllNodesFlat(
  nodes: Record<string, ArgoNodeStatus>,
): ArgoNodeStatus[] {
  return Object.values(nodes);
}

export function getRootNodeId(workflow: ArgoWorkflow): string | null {
  if (!workflow.status.nodes) return null;
  return workflow.metadata.name;
}

export function calculateDuration(
  startedAt?: string,
  finishedAt?: string,
): string {
  if (!startedAt) return 'Not started';

  const start = new Date(startedAt);
  const end = finishedAt ? new Date(finishedAt) : new Date();
  const durationMs = end.getTime() - start.getTime();

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}
