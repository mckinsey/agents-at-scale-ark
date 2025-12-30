/**
 * Flows Service
 *
 * This service manages "Flows" - saved configurations of Argo WorkflowTemplates
 * with pre-filled parameters. Flows act as shortcuts for running common workflows.
 *
 * STORAGE: Flows are stored in localStorage (client-side only).
 * This is an intentional MVP design choice:
 * - Flows are personal workflow shortcuts, not shared team resources
 * - No database schema changes required
 * - Simple to implement and test
 * - Easy to migrate to server-side storage later if needed
 *
 * If flows need to be shared across users or persisted server-side,
 * add a /api/flows endpoint backed by a database.
 */
import type {
  Flow,
  FlowParameter,
  FlowRun,
  WorkflowTemplate,
} from '@/lib/types/flow';

const FLOWS_STORAGE_KEY = 'ark-flows';

let cachedArgoBaseUrl: string | null = null;

async function getArgoBaseUrl(): Promise<string> {
  if (cachedArgoBaseUrl) return cachedArgoBaseUrl;
  try {
    const response = await fetch('/api/argo/config');
    if (response.ok) {
      const config = await response.json();
      cachedArgoBaseUrl = config.baseUrl;
      return config.baseUrl;
    }
  } catch (error) {
    console.warn('Failed to fetch Argo config:', error);
  }
  return 'http://localhost:2746';
}

export { getArgoBaseUrl };

/**
 * Check if Argo Workflows is deployed and accessible.
 * Used for graceful degradation - shows helpful setup message instead of errors
 * when Argo is not installed.
 */
async function checkArgoAvailable(): Promise<boolean> {
  try {
    const response = await fetch(
      '/api/argo/workflow-templates?namespace=default',
    );
    return response.ok;
  } catch {
    return false;
  }
}

export { checkArgoAvailable };

function generateId(): string {
  return `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getFlowsFromStorage(): Flow[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(FLOWS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveFlowsToStorage(flows: Flow[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(flows));
}

export const flowsService = {
  async getAll(): Promise<Flow[]> {
    return getFlowsFromStorage();
  },

  async getById(id: string): Promise<Flow | null> {
    const flows = getFlowsFromStorage();
    return flows.find(f => f.id === id) || null;
  },

  async create(
    data: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Flow> {
    const flows = getFlowsFromStorage();
    const now = new Date().toISOString();
    const newFlow: Flow = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    flows.push(newFlow);
    saveFlowsToStorage(flows);
    return newFlow;
  },

  async update(
    id: string,
    data: Partial<Omit<Flow, 'id' | 'createdAt'>>,
  ): Promise<Flow | null> {
    const flows = getFlowsFromStorage();
    const index = flows.findIndex(f => f.id === id);
    if (index === -1) return null;

    const updated: Flow = {
      ...flows[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    flows[index] = updated;
    saveFlowsToStorage(flows);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const flows = getFlowsFromStorage();
    const filtered = flows.filter(f => f.id !== id);
    if (filtered.length === flows.length) return false;
    saveFlowsToStorage(filtered);
    return true;
  },
};

export const workflowTemplatesService = {
  async getAll(namespace: string = 'default'): Promise<WorkflowTemplate[]> {
    try {
      const response = await fetch(
        `/api/argo/workflow-templates?namespace=${namespace}`,
      );
      if (!response.ok) {
        console.warn('Failed to fetch workflow templates, using empty list');
        return [];
      }
      return response.json();
    } catch (error) {
      console.warn('Error fetching workflow templates:', error);
      return [];
    }
  },

  async getByName(
    name: string,
    namespace: string = 'default',
  ): Promise<WorkflowTemplate | null> {
    try {
      const response = await fetch(
        `/api/argo/workflow-templates/${name}?namespace=${namespace}`,
      );
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      console.warn('Error fetching workflow template:', error);
      return null;
    }
  },
};

export const flowRunsService = {
  async run(
    flow: Flow,
    parameterOverrides?: FlowParameter[],
  ): Promise<FlowRun> {
    const parameters = parameterOverrides || flow.parameters;

    try {
      const response = await fetch('/api/argo/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Labels link workflow runs back to the originating Flow for tracking
        body: JSON.stringify({
          templateName: flow.templateName,
          namespace: flow.templateNamespace,
          parameters: parameters.map(p => ({ name: p.name, value: p.value })),
          labels: {
            'ark-flow-id': flow.id,
            'ark-flow-name': flow.name,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit workflow');
      }

      const result = await response.json();
      const baseUrl = await getArgoBaseUrl();

      return {
        name: result.name,
        flowId: flow.id,
        flowName: flow.name,
        status: 'Pending',
        startedAt: new Date().toISOString(),
        argoUrl: `${baseUrl}/workflows/${flow.templateNamespace}/${result.name}`,
      };
    } catch (error) {
      console.error('Error running flow:', error);
      throw error;
    }
  },

  async getRecentRuns(
    flowId?: string,
    namespace: string = 'default',
  ): Promise<FlowRun[]> {
    try {
      const labelSelector = flowId ? `ark-flow-id=${flowId}` : 'ark-flow-id';
      const response = await fetch(
        `/api/argo/workflows?namespace=${namespace}&labelSelector=${encodeURIComponent(labelSelector)}`,
      );

      if (!response.ok) return [];

      const workflows = await response.json();
      const baseUrl = await getArgoBaseUrl();
      return workflows.map(
        (w: {
          metadata: {
            name: string;
            labels?: Record<string, string>;
            creationTimestamp: string;
          };
          status?: { phase?: string; finishedAt?: string };
        }) => ({
          name: w.metadata.name,
          flowId: w.metadata.labels?.['ark-flow-id'] || '',
          flowName: w.metadata.labels?.['ark-flow-name'] || '',
          status: w.status?.phase || 'Pending',
          startedAt: w.metadata.creationTimestamp,
          finishedAt: w.status?.finishedAt,
          argoUrl: `${baseUrl}/workflows/${namespace}/${w.metadata.name}`,
        }),
      );
    } catch (error) {
      console.warn('Error fetching workflow runs:', error);
      return [];
    }
  },

  async getArgoUrl(
    workflowName: string,
    namespace: string = 'default',
  ): Promise<string> {
    const baseUrl = await getArgoBaseUrl();
    return `${baseUrl}/workflows/${namespace}/${workflowName}`;
  },
};
