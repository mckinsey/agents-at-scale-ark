import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentsService } from '@/lib/services/agents';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  withNamespace: vi.fn((ns?: string) =>
    ns ? { params: { namespace: ns } } : undefined,
  ),
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const mockAgentDetail = {
  name: 'test-agent',
  description: 'A test agent',
};

describe('agentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('passes namespace as query parameter when provided', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockAgentDetail);

      await agentsService.create(
        { name: 'test-agent', model: 'gpt-4' },
        { namespace: 'custom-ns' },
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/agents',
        { name: 'test-agent', model: 'gpt-4' },
        { params: { namespace: 'custom-ns' } },
      );
    });

    it('does not pass namespace when not provided', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockAgentDetail);

      await agentsService.create({ name: 'test-agent', model: 'gpt-4' });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/agents',
        { name: 'test-agent', model: 'gpt-4' },
        undefined,
      );
    });
  });

  describe('update', () => {
    it('passes namespace as query parameter when provided', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockAgentDetail);

      await agentsService.update('test-agent', { description: 'updated' }, {
        namespace: 'custom-ns',
      });

      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/v1/agents/test-agent',
        { description: 'updated' },
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('delete', () => {
    it('passes namespace as query parameter when provided', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await agentsService.delete('test-agent', { namespace: 'custom-ns' });

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/v1/agents/test-agent',
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('getById', () => {
    it('passes namespace to getByName', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAgentDetail);

      await agentsService.getById('test-agent', { namespace: 'custom-ns' });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/agents/test-agent',
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('updateById', () => {
    it('passes namespace to update', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockAgentDetail);

      await agentsService.updateById('test-agent', { description: 'updated' }, {
        namespace: 'custom-ns',
      });

      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/v1/agents/test-agent',
        { description: 'updated' },
        { params: { namespace: 'custom-ns' } },
      );
    });
  });

  describe('deleteById', () => {
    it('passes namespace to delete', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await agentsService.deleteById('test-agent', { namespace: 'custom-ns' });

      expect(apiClient.delete).toHaveBeenCalledWith(
        '/api/v1/agents/test-agent',
        { params: { namespace: 'custom-ns' } },
      );
    });
  });
});
