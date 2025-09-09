import { apiClient } from "@/lib/api/client";
import type { components } from "@/lib/api/generated/types";

type QueryListResponse = components["schemas"]["QueryListResponse"];
type QueryDetailResponse = components["schemas"]["QueryDetailResponse"];
type QueryCreateRequest = components["schemas"]["QueryCreateRequest"];
type QueryUpdateRequest = components["schemas"]["QueryUpdateRequest"];

export const queriesService = {
  async list(namespace: string): Promise<QueryListResponse> {
    const response = await apiClient.get<QueryListResponse>(
      `/api/v1/namespaces/${namespace}/queries`
    );
    return response;
  },

  async get(
    namespace: string,
    queryName: string
  ): Promise<QueryDetailResponse> {
    const response = await apiClient.get<QueryDetailResponse>(
      `/api/v1/namespaces/${namespace}/queries/${queryName}`
    );
    return response;
  },

  // NEW: raw-aware getter (optional)

  async create(
    namespace: string,
    query: QueryCreateRequest
  ): Promise<QueryDetailResponse> {
    const response = await apiClient.post<QueryDetailResponse>(
      `/api/v1/namespaces/${namespace}/queries`,
      query
    );
    return response;
  },

  async update(
    namespace: string,
    queryName: string,
    query: QueryUpdateRequest
  ): Promise<QueryDetailResponse> {
    const response = await apiClient.put<QueryDetailResponse>(
      `/api/v1/namespaces/${namespace}/queries/${queryName}`,
      query
    );
    return response;
  },

  async delete(namespace: string, queryName: string): Promise<void> {
    await apiClient.delete(
      `/api/v1/namespaces/${namespace}/queries/${queryName}`
    );
  },

  async cancel(
    namespace: string,
    queryName: string
  ): Promise<QueryDetailResponse> {
    const response = await apiClient.patch<QueryDetailResponse>(
      `/api/v1/namespaces/${namespace}/queries/${queryName}/cancel`
    );
    return response;
  },

  async getStatus(namespace: string, queryName: string): Promise<string> {
    try {
      const query = await this.get(namespace, queryName);
      return (query.status as { phase?: string })?.phase || "unknown";
    } catch (error) {
      console.error(`Failed to get status for query ${queryName}:`, error);
      return "unknown";
    }
  },

  async streamQueryStatus(
    namespace: string,
    queryName: string,
    onUpdate: (status: string, query?: QueryDetailResponse) => void
  ): Promise<{ terminal: boolean; finalStatus: string }> {
    return new Promise((resolve) => {
      const pollStatus = async () => {
        try {
          const query = await this.get(namespace, queryName);
          const status =
            (query.status as { phase?: string })?.phase || "unknown";

          onUpdate(status, query);

          if (
            status === "done" ||
            status === "error" ||
            status === "canceled"
          ) {
            resolve({ terminal: true, finalStatus: status });
          } else {
            setTimeout(pollStatus, 1000);
          }
        } catch (error) {
          console.error(
            `Error streaming status for query ${queryName}:`,
            error
          );
          onUpdate("error");
          resolve({ terminal: true, finalStatus: "error" });
        }
      };

      pollStatus();
    });
  }
};
