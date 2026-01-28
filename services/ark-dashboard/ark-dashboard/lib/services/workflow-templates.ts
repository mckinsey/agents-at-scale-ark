import { apiClient } from '@/lib/api/client';

export interface WorkflowTemplateMetadata {
  name: string;
  namespace?: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  creationTimestamp?: string;
}

export interface WorkflowParameter {
  name: string;
  value?: string;
  default?: string;
}

export interface WorkflowSpec {
  entrypoint?: string;
  arguments?: {
    parameters?: WorkflowParameter[];
  };
  templates?: Array<{
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
  }>;
}

export interface WorkflowTemplate {
  apiVersion: string;
  kind: string;
  metadata: WorkflowTemplateMetadata;
  spec?: WorkflowSpec;
}

export interface WorkflowTemplateList {
  apiVersion: string;
  kind: string;
  items: WorkflowTemplate[];
}

export interface Workflow {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
  };
  spec: {
    workflowTemplateRef: {
      name: string;
    };
    arguments?: {
      parameters?: Array<{
        name: string;
        value: string;
      }>;
    };
  };
  status?: {
    phase?: string;
    finishedAt?: string;
    startedAt?: string;
  };
}

export interface WorkflowList {
  kind: string;
  items: Workflow[];
}

export interface WorkflowStats {
  total: number;
  succeeded: number;
  running: number;
  failed: number;
}

export const workflowTemplatesService = {
  async list(): Promise<WorkflowTemplate[]> {
    const response = await apiClient.get<WorkflowTemplateList>(
      '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate',
    );
    return response.items;
  },

  async get(name: string): Promise<WorkflowTemplate> {
    const response = await apiClient.get<WorkflowTemplate>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/${name}`,
    );
    return response;
  },

  async getYaml(name: string): Promise<string> {
    const response = await apiClient.get<string>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/${name}`,
      {
        headers: {
          Accept: 'application/yaml',
        },
      },
    );
    return response;
  },

  async run(
    templateName: string,
    parameters?: Record<string, string>,
    workflowName?: string,
  ): Promise<Workflow> {
    const timestamp = Date.now();
    const workflow: Workflow = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: workflowName || `${templateName}-${timestamp}`,
      },
      spec: {
        workflowTemplateRef: {
          name: templateName,
        },
      },
    };

    if (parameters && Object.keys(parameters).length > 0) {
      workflow.spec.arguments = {
        parameters: Object.entries(parameters).map(([name, value]) => ({
          name,
          value,
        })),
      };
    }

    try {
      const response = await apiClient.post<Workflow>(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow',
        workflow,
      );
      return response;
    } catch (error) {
      console.error('Error creating workflow:', error);
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as {
          status?: number;
          data?: {
            message?: string;
            reason?: string;
          };
        };
        console.error('API Error status:', apiError.status);
        console.error('API Error data:', apiError.data);

        if (apiError.status === 409) {
          throw new Error(
            `A workflow with the name "${workflow.metadata.name}" already exists`,
          );
        }
        if (apiError.data) {
          if (apiError.data.message) {
            throw new Error(String(apiError.data.message));
          }
          if (apiError.data.reason && apiError.data.message) {
            throw new Error(
              `${apiError.data.reason}: ${apiError.data.message}`,
            );
          }
        }
      }
      throw error;
    }
  },

  async delete(name: string): Promise<void> {
    await apiClient.delete(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/${name}`,
    );
  },

  async getStats(templateName: string): Promise<WorkflowStats> {
    const response = await apiClient.get<WorkflowList>(
      '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow',
    );

    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const recentWorkflows = response.items.filter(workflow => {
      const matchesTemplate =
        workflow.spec.workflowTemplateRef?.name === templateName;
      const createdAt = workflow.metadata.creationTimestamp
        ? new Date(workflow.metadata.creationTimestamp)
        : null;
      const isRecent = createdAt ? createdAt >= oneDayAgo : false;

      return matchesTemplate && isRecent;
    });

    const stats: WorkflowStats = {
      total: recentWorkflows.length,
      succeeded: 0,
      running: 0,
      failed: 0,
    };

    recentWorkflows.forEach(workflow => {
      const phase = workflow.status?.phase?.toLowerCase();

      if (phase === 'succeeded') {
        stats.succeeded++;
      } else if (phase === 'running' || phase === 'pending') {
        stats.running++;
      } else if (phase === 'failed' || phase === 'error') {
        stats.failed++;
      }
    });

    return stats;
  },
};
