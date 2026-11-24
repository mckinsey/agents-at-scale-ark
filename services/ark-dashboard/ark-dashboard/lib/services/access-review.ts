import { apiClient } from '@/lib/api/client';

export interface AccessReviewParams {
  group: string;
  resource: string;
  verb: string;
}

interface AccessReviewResponse {
  allowed: boolean;
}

export const accessReviewService = {
  async check(
    namespace: string,
    params: AccessReviewParams,
  ): Promise<boolean> {
    const response = await apiClient.post<AccessReviewResponse>(
      '/api/v1/resources/access-review',
      {
        group: params.group,
        resource: params.resource,
        verb: params.verb,
      },
      { params: { namespace } },
    );
    return response.allowed;
  },
};
