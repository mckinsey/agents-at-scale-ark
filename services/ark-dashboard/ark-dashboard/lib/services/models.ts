import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import { fetchAllPages, fetchPage, type Page } from '@/lib/api/pagination';
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

/**
 * List-payload shape returned by `GET /models`. Detail-only fields
 * (config, tokens, …) require an explicit `getByName` call.
 */
export type ModelListItem = ModelResponse & { id: string };

// CRUD Operations
export const modelsService = {
  async getPage(
    continueToken: string | null = null,
  ): Promise<Page<ModelListItem>> {
    const page = await fetchPage<ModelResponse>(
      `/api/v1/models`,
      continueToken,
    );
    return {
      items: page.items.map(item => ({ ...item, id: item.name })),
      continueToken: page.continueToken,
    };
  },

  /**
   * Fetch every model across all pages. Returns list-payload shape only —
   * no per-model detail fetch. Callers needing detail fields must call
   * `getByName` explicitly.
   */
  async getAll(): Promise<ModelListItem[]> {
    const items = await fetchAllPages<ModelResponse>(`/api/v1/models`);
    return items.map(item => ({ ...item, id: item.name }));
  },

  // Get a single model by name
  async getByName(name: string): Promise<Model | null> {
    try {
      const response = await apiClient.get<ModelDetailResponse>(
        `/api/v1/models/${name}`,
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
  async getById(id: number | string): Promise<Model | null> {
    // Convert numeric ID to string name
    const name = String(id);
    return modelsService.getByName(name);
  },

  async create(model: ModelCreateRequest): Promise<Model> {
    const response = await apiClient.post<ModelDetailResponse>(
      `/api/v1/models`,
      model,
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
  ): Promise<Model | null> {
    try {
      const response = await apiClient.put<ModelDetailResponse>(
        `/api/v1/models/${name}`,
        updates,
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
  ): Promise<Model | null> {
    const name = String(id);
    return modelsService.update(name, updates);
  },

  async delete(name: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/models/${name}`);

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
  async deleteById(id: number | string): Promise<boolean> {
    const name = String(id);
    return modelsService.delete(name);
  },
};
