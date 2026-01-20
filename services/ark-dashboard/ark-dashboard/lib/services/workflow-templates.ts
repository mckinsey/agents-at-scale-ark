import { apiClient } from '@/lib/api/client';

export interface WorkflowTemplateMetadata {
  name: string;
  namespace?: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  creationTimestamp?: string;
}

export interface WorkflowTemplate {
  apiVersion: string;
  kind: string;
  metadata: WorkflowTemplateMetadata;
  spec?: unknown;
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
  };
  spec: {
    workflowTemplateRef: {
      name: string;
    };
  };
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

  async run(templateName: string): Promise<Workflow> {
    const timestamp = Date.now();
    const workflow: Workflow = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: `${templateName}-${timestamp}`,
      },
      spec: {
        workflowTemplateRef: {
          name: templateName,
        },
      },
    };

    const response = await apiClient.post<Workflow>(
      '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow',
      workflow,
    );
    console.log('Workflow creation response:', response);
    return response;
  },
};
