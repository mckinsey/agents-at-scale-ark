import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { executionEnginesService } from '@/lib/services/engines';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const ENGINE_PATH =
  '/api/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine';

describe('executionEnginesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delete', () => {
    it('deletes the engine in the given namespace', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await executionEnginesService.delete('test-namespace', 'my-engine');

      expect(apiClient.delete).toHaveBeenCalledWith(
        `${ENGINE_PATH}/my-engine`,
        {
          params: { namespace: 'test-namespace' },
        },
      );
    });

    it('propagates a refused delete instead of reporting success', async () => {
      vi.mocked(apiClient.delete).mockRejectedValueOnce(
        new Error('impersonation is not enabled'),
      );

      await expect(
        executionEnginesService.delete('test-namespace', 'my-engine'),
      ).rejects.toThrow('impersonation is not enabled');
    });
  });

  describe('canDelete', () => {
    it('reviews delete on executionengines in the given namespace', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ allowed: false });

      const allowed = await executionEnginesService.canDelete('test-namespace');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/resources/access-review',
        {
          group: 'ark.mckinsey.com',
          resource: 'executionengines',
          verb: 'delete',
        },
        { params: { namespace: 'test-namespace' } },
      );
      expect(allowed).toBe(false);
    });
  });
});
