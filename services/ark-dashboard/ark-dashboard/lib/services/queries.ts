import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

type QueryListResponse = components['schemas']['QueryListResponse'];
type QueryDetailResponse = components['schemas']['QueryDetailResponse'];
type QueryCreateRequest = components['schemas']['QueryCreateRequest'];
type QueryUpdateRequest = components['schemas']['QueryUpdateRequest'];

export const queriesService = {
  async list(): Promise<QueryListResponse> {
    const response = await apiClient.get<QueryListResponse>(`/api/v1/queries`);
    return response;
  },

  async get(queryName: string): Promise<QueryDetailResponse> {
    const response = await apiClient.get<QueryDetailResponse>(
      `/api/v1/queries/${queryName}`,
    );
    return response;
  },

  async create(query: QueryCreateRequest): Promise<QueryDetailResponse> {
    const response = await apiClient.post<QueryDetailResponse>(
      `/api/v1/queries`,
      query,
    );

    trackEvent({
      name: 'query_created',
      properties: {
        queryName: response.name,
        targetType: query.target?.type,
        targetName: query.target?.name,
        hasMemory: !!query.memory,
        hasTimeout: !!query.timeout,
      },
    });

    return response;
  },

  async update(
    queryName: string,
    query: QueryUpdateRequest,
  ): Promise<QueryDetailResponse> {
    const response = await apiClient.put<QueryDetailResponse>(
      `/api/v1/queries/${queryName}`,
      query,
    );
    return response;
  },

  async delete(queryName: string): Promise<void> {
    await apiClient.delete(`/api/v1/queries/${queryName}`);

    trackEvent({
      name: 'query_deleted',
      properties: {
        queryName,
      },
    });
  },

  async cancel(queryName: string): Promise<QueryDetailResponse> {
    const response = await apiClient.patch<QueryDetailResponse>(
      `/api/v1/queries/${queryName}/cancel`,
    );

    trackEvent({
      name: 'query_canceled',
      properties: {
        queryName,
      },
    });

    return response;
  },

  async getStatus(queryName: string): Promise<string> {
    try {
      const query = await this.get(queryName);
      return (query.status as { phase?: string })?.phase || 'unknown';
    } catch (error) {
      console.error(`Failed to get status for query ${queryName}:`, error);
      return 'unknown';
    }
  },

  async streamQueryStatus(
    queryName: string,
    onUpdate: (status: string, query?: QueryDetailResponse) => void,
  ): Promise<{ terminal: boolean; finalStatus: string }> {
    return new Promise(resolve => {
      const pollStatus = async () => {
        try {
          const query = await this.get(queryName);
          const status =
            (query.status as { phase?: string })?.phase || 'unknown';

          onUpdate(status, query);

          if (
            status === 'done' ||
            status === 'error' ||
            status === 'canceled'
          ) {
            resolve({ terminal: true, finalStatus: status });
          } else {
            setTimeout(pollStatus, 1000);
          }
        } catch (error) {
          console.error(
            `Error streaming status for query ${queryName}:`,
            error,
          );
          onUpdate('error');
          resolve({ terminal: true, finalStatus: 'error' });
        }
      };

      pollStatus();
    });
  },
};
