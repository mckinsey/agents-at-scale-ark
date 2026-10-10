import { apiClient } from '@/lib/api/client';
import { fetchAllPages } from '@/lib/api/pagination';
import type { components } from '@/lib/api/generated/types';

// Helper type for axios errors
interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

// Use the generated types from OpenAPI
export type MemoryResponse = components['schemas']['MemoryResponse'];
export type MemoryDetailResponse =
  components['schemas']['MemoryDetailResponse'];
export type MemoryListResponse = components['schemas']['MemoryListResponse'];
export type MemoryCreateRequest = components['schemas']['MemoryCreateRequest'];
export type MemoryUpdateRequest = components['schemas']['MemoryUpdateRequest'];

// For UI compatibility, we'll map the API response to include an id field
export type Memory = MemoryDetailResponse & { id: string };

// List-response shape, no detail-only fields (#2581)
export type MemoryListItem = MemoryResponse & { id: string };

// CRUD Operations
export const memoriesService = {
  async getAll(namespace: string): Promise<MemoryListItem[]> {
    const items = await fetchAllPages<MemoryResponse>(`/api/v1/memories`, {
      namespace,
    });

    return items.map(item => ({ ...item, id: item.name }));
  },

  // Get a single memory by name
  async getByName(namespace: string, name: string): Promise<Memory | null> {
    try {
      const response = await apiClient.get<MemoryDetailResponse>(
        `/api/v1/memories/${name}`,
        { params: { namespace } },
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

  // Get a single memory by ID (for UI compatibility - ID is actually the name)
  async getById(
    namespace: string,
    id: number | string,
  ): Promise<Memory | null> {
    // Convert numeric ID to string name
    const name = String(id);
    return memoriesService.getByName(namespace, name);
  },

  // Create a new memory
  async create(
    namespace: string,
    memory: MemoryCreateRequest,
  ): Promise<Memory> {
    const response = await apiClient.post<MemoryDetailResponse>(
      `/api/v1/memories`,
      memory,
      { params: { namespace } },
    );
    return {
      ...response,
      id: response.name,
    };
  },

  // Update an existing memory
  async update(
    namespace: string,
    name: string,
    updates: MemoryUpdateRequest,
  ): Promise<Memory | null> {
    try {
      const response = await apiClient.put<MemoryDetailResponse>(
        `/api/v1/memories/${name}`,
        updates,
        { params: { namespace } },
      );
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
    namespace: string,
    id: number | string,
    updates: MemoryUpdateRequest,
  ): Promise<Memory | null> {
    const name = String(id);
    return memoriesService.update(namespace, name, updates);
  },

  // Delete a memory
  async delete(namespace: string, name: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/memories/${name}`, {
        params: { namespace },
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
    namespace: string,
    id: number | string,
  ): Promise<boolean> {
    const name = String(id);
    return memoriesService.delete(namespace, name);
  },
};
