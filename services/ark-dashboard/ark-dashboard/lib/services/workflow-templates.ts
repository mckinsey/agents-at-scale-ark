import yaml from 'js-yaml';

import { APIError, apiClient } from '@/lib/api/client';
import { ARK_LABELS } from '@/lib/constants/labels';
import { accessReviewService } from '@/lib/services/access-review';

export const WORKFLOW_TEMPLATE_ANNOTATIONS = {
  TITLE: 'workflows.argoproj.io/title',
  DESCRIPTION: 'workflows.argoproj.io/description',
} as const;

export function isArgoNotInstalledError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.status === 404 &&
    /not available|not installed|CRD/i.test(error.message)
  );
}

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
  description?: string;
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

export type WorkflowTemplateSaveMode = 'create' | 'update';

export const workflowTemplatesService = {
  async list(): Promise<WorkflowTemplate[]> {
    const response = await apiClient.get<WorkflowTemplateList>(
      '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate',
      { params: { labelSelector: `${ARK_LABELS.DASHBOARD_HIDDEN}!=true` } },
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

  async save(
    yamlText: string,
    mode: WorkflowTemplateSaveMode,
  ): Promise<WorkflowTemplate> {
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid YAML: ${message}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('YAML must be a mapping with kind: WorkflowTemplate');
    }

    const resource = parsed as Record<string, unknown>;
    if (resource.kind !== 'WorkflowTemplate') {
      throw new Error(
        `Expected kind "WorkflowTemplate" but got "${String(resource.kind)}"`,
      );
    }

    if (mode === 'create') {
      return apiClient.post<WorkflowTemplate>(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate',
        resource,
      );
    }

    const metadata = resource.metadata;
    const name =
      metadata &&
      typeof metadata === 'object' &&
      'name' in metadata &&
      typeof (metadata as Record<string, unknown>).name === 'string'
        ? (metadata as Record<string, unknown>).name
        : undefined;

    if (!name) {
      throw new Error('WorkflowTemplate metadata.name is required for update');
    }

    return apiClient.put<WorkflowTemplate>(
      `/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/${String(name)}`,
      resource,
    );
  },

  async nameExists(name: string): Promise<boolean> {
    const templates = await workflowTemplatesService.list();
    return templates.some(template => template.metadata.name === name);
  },

  async canCreate(): Promise<boolean> {
    return accessReviewService.check({
      group: 'argoproj.io',
      resource: 'workflowtemplates',
      verb: 'create',
    });
  },

  async canUpdate(): Promise<boolean> {
    return accessReviewService.check({
      group: 'argoproj.io',
      resource: 'workflowtemplates',
      verb: 'update',
    });
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
