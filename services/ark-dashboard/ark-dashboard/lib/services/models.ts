import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient, withNamespace, type ServiceOptions } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

// Helper type for axios errors
interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

// Use the generated types from OpenAPI
export type ModelResponse = components['schemas']['ModelResponse'];
export type ModelDetailResponse = components['schemas']['ModelDetailResponse'];
export type ModelListResponse = components['schemas']['ModelListResponse'];
export type ModelCreateRequest = components['schemas']['ModelCreateRequest'];
export type ModelUpdateRequest = components['schemas']['ModelUpdateRequest'];

// For UI compatibility, we'll map the API response to include an id field
export type Model = ModelDetailResponse & { id: string };

// CRUD Operations
export const modelsService = {
  // Get all models
  async getAll(namespace?: string): Promise<Model[]> {
    const response = await apiClient.get<ModelListResponse>(
      `/api/v1/models`,
      withNamespace(namespace),
    );

    // Map the response items to include id for UI compatibility
    const models = await Promise.all(
      response.items.map(async item => {
        // Fetch detailed info for each model to get full data
        const detailed = await modelsService.getByName(item.name, namespace);
        return detailed!;
      }),
    );

    return models;
  },

  // Get a single model by name
  async getByName(name: string, namespace?: string): Promise<Model | null> {
    try {
      const response = await apiClient.get<ModelDetailResponse>(
        `/api/v1/models/${name}`,
        withNamespace(namespace),
      );
      return {
        ...response,
        id: response.name, // Use name as id for UI compatibility
      };
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Get a single model by ID (for UI compatibility - ID is actually the name)
  async getById(
    id: number | string,
    options?: ServiceOptions,
  ): Promise<Model | null> {
    const name = String(id);
    return modelsService.getByName(name, options?.namespace);
  },

  async create(
    model: ModelCreateRequest,
    options?: ServiceOptions,
  ): Promise<Model> {
    const response = await apiClient.post<ModelDetailResponse>(
      `/api/v1/models`,
      model,
      withNamespace(options?.namespace),
    );

    trackEvent({
      name: 'model_created',
      properties: {
        modelName: response.name,
        modelProvider: model.provider,
      },
    });

    return {
      ...response,
      id: response.name,
    };
  },

  async update(
    name: string,
    updates: ModelUpdateRequest,
    options?: ServiceOptions,
  ): Promise<Model | null> {
    try {
      const response = await apiClient.put<ModelDetailResponse>(
        `/api/v1/models/${name}`,
        updates,
        withNamespace(options?.namespace),
      );

      trackEvent({
        name: 'model_updated',
        properties: {
          modelName: response.name,
        },
      });

      return {
        ...response,
        id: response.name,
      };
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Update by ID (for UI compatibility)
  async updateById(
    id: number | string,
    updates: ModelUpdateRequest,
    options?: ServiceOptions,
  ): Promise<Model | null> {
    const name = String(id);
    return modelsService.update(name, updates, options);
  },

  async delete(name: string, options?: ServiceOptions): Promise<boolean> {
    try {
      await apiClient.delete(
        `/api/v1/models/${name}`,
        withNamespace(options?.namespace),
      );

      trackEvent({
        name: 'model_deleted',
        properties: {
          modelName: name,
        },
      });

      return true;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return false;
      }
      throw error;
    }
  },

  // Delete by ID (for UI compatibility)
  async deleteById(
    id: number | string,
    options?: ServiceOptions,
  ): Promise<boolean> {
    const name = String(id);
    return modelsService.delete(name, options);
  },
};
