import { describe, it, expect, vi, beforeEach } from 'vitest';
import { A2AServersService } from '@/lib/services/a2a-servers';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client');

describe('A2AServersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delete', () => {
    it('should call delete endpoint with correct identifier', async () => {
      const mockDelete = vi.spyOn(apiClient, 'delete').mockResolvedValue(undefined);

      await A2AServersService.delete('test-server');

      expect(mockDelete).toHaveBeenCalledWith('/api/v1/a2a-servers/test-server');
    });

    it('should handle delete errors', async () => {
      const mockError = new Error('Delete failed');
      vi.spyOn(apiClient, 'delete').mockRejectedValue(mockError);

      await expect(A2AServersService.delete('test-server')).rejects.toThrow('Delete failed');
    });
  });

  describe('create', () => {
    it('should call post endpoint with configuration', async () => {
      const config = {
        name: 'test-server',
        namespace: 'default',
        spec: {
          address: { value: 'http://test.com' },
        },
      };

      const mockPost = vi.spyOn(apiClient, 'post').mockResolvedValue({
        id: 'test-server',
        name: 'test-server',
        namespace: 'default',
      });

      const result = await A2AServersService.create(config);

      expect(mockPost).toHaveBeenCalledWith('/api/v1/a2a-servers', config);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', 'test-server');
    });
  });

  describe('update', () => {
    it('should call put endpoint with spec', async () => {
      const spec = {
        spec: {
          address: { value: 'http://updated.com' },
        },
      };

      const mockPut = vi.spyOn(apiClient, 'put').mockResolvedValue({
        id: 'test-server',
        name: 'test-server',
        namespace: 'default',
      });

      const result = await A2AServersService.update('test-server', spec);

      expect(mockPut).toHaveBeenCalledWith('/api/v1/a2a-servers/test-server', spec);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', 'test-server');
    });
  });
});
