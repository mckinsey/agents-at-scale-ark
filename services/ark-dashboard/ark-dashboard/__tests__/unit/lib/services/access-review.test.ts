import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { accessReviewService } from '@/lib/services/access-review';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('accessReviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('check', () => {
    it('should POST the params and return allowed=true', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ allowed: true });

      const result = await accessReviewService.check('default', {
        group: 'argoproj.io',
        resource: 'workflowtemplates',
        verb: 'create',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/resources/access-review',
        {
          group: 'argoproj.io',
          resource: 'workflowtemplates',
          verb: 'create',
        }, { params: { namespace: 'default' } });
      expect(result).toBe(true);
    });

    it('should return allowed=false', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ allowed: false });

      const result = await accessReviewService.check('default', {
        group: 'argoproj.io',
        resource: 'workflowtemplates',
        verb: 'update',
      });

      expect(result).toBe(false);
    });

    it('should propagate errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('forbidden'));

      await expect(
        accessReviewService.check('default', {
          group: 'argoproj.io',
          resource: 'workflowtemplates',
          verb: 'create',
        }),
      ).rejects.toThrow('forbidden');
    });
  });
});
