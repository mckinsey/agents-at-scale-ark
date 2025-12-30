import type { WorkflowTemplate } from '@/lib/types/flow';

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
