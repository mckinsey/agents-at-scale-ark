import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

// Use the generated type from OpenAPI
export type Namespace = components['schemas']['NamespaceResponse'] & {
  id: number;
};
export type NamespaceListResponse =
  components['schemas']['NamespaceListResponse'];
export type NamespaceCreateRequest =
  components['schemas']['NamespaceCreateRequest'];

// Service with list and create operations
export const namespacesService = {
  // Get all namespaces
  async getAll(): Promise<Namespace[]> {
    const response =
      await apiClient.get<NamespaceListResponse>('/api/v1/namespaces');
    return response.items.map((item, index) => ({
      ...item,
      id: index,
    }));
  },

  // Get current Kubernetes context
  async getContext(): Promise<{ namespace: string; cluster: string }> {
    const response = await apiClient.get<{
      namespace: string;
      cluster: string;
    }>('/api/v1/context');
    return response;
  },

  // Create a new namespace
  async create(name: string): Promise<Namespace> {
    const request: NamespaceCreateRequest = { name };
    const response = await apiClient.post<
      components['schemas']['NamespaceResponse']
    >('/api/v1/namespaces', request);
    trackEvent({
      name: 'namespace_created',
      properties: { namespaceName: response.name },
    });
    return {
      ...response,
      id: 0, // Will be properly assigned when we refresh the list
    };
  },
};
