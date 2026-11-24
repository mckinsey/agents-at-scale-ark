import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import {
  configurationsService,
  type Configuration,
} from '@/lib/services/configurations';

vi.mock('@/lib/api/client');
vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const CONFIGURATION: Configuration = {
  id: 'uuid-1234',
  name: 'github-mcp-url',
  value: 'https://example.test/mcp/',
  description: 'GitHub remote MCP endpoint',
  alias: 'github-mcp',
  labels: ['mcp'],
};

describe('configurationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('unwraps the items array from the list response', async () => {
      const mockGet = vi.spyOn(apiClient, 'get').mockResolvedValue({
        items: [CONFIGURATION],
        count: 1,
      });

      const result = await configurationsService.getAll('default');

      expect(mockGet).toHaveBeenCalledWith('/api/v1/configurations', {
        params: { namespace: 'default' },
      });
      expect(result).toEqual([CONFIGURATION]);
    });
  });

  describe('get', () => {
    it('requests a single configuration by name', async () => {
      const mockGet = vi
        .spyOn(apiClient, 'get')
        .mockResolvedValue(CONFIGURATION);

      const result = await configurationsService.get(
        'default',
        'github-mcp-url',
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/configurations/github-mcp-url',
        { params: { namespace: 'default' } },
      );
      expect(result).toEqual(CONFIGURATION);
    });
  });

  describe('create', () => {
    it('posts the request unchanged', async () => {
      const mockPost = vi
        .spyOn(apiClient, 'post')
        .mockResolvedValue(CONFIGURATION);

      const request = {
        name: 'github-mcp-url',
        value: 'https://example.test/mcp/',
        description: 'GitHub remote MCP endpoint',
        alias: 'github-mcp',
        labels: ['mcp'],
      };

      const result = await configurationsService.create('default', request);

      expect(mockPost).toHaveBeenCalledWith('/api/v1/configurations', request, {
        params: { namespace: 'default' },
      });
      expect(result).toEqual(CONFIGURATION);
    });

    it('propagates errors instead of swallowing them', async () => {
      vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Conflict'));

      await expect(
        configurationsService.create('default', {
          name: 'github-mcp-url',
          value: 'x',
          labels: [],
        }),
      ).rejects.toThrow('Conflict');
    });
  });

  describe('update', () => {
    it('puts to the named configuration', async () => {
      const mockPut = vi
        .spyOn(apiClient, 'put')
        .mockResolvedValue(CONFIGURATION);

      const request = { value: 'https://new.test/mcp/', labels: [] };
      await configurationsService.update('default', 'github-mcp-url', request);

      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/configurations/github-mcp-url',
        request,
        { params: { namespace: 'default' } },
      );
    });
  });

  describe('delete', () => {
    it('deletes by name', async () => {
      const mockDelete = vi
        .spyOn(apiClient, 'delete')
        .mockResolvedValue(undefined);

      await configurationsService.delete('default', 'github-mcp-url');

      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/configurations/github-mcp-url',
        { params: { namespace: 'default' } },
      );
    });
  });

  describe('getReferences', () => {
    it('unwraps the items array from the references response', async () => {
      const reference = {
        kind: 'MCPServer',
        name: 'github-mcp',
        field: 'spec.address',
      };
      const mockGet = vi
        .spyOn(apiClient, 'get')
        .mockResolvedValue({ items: [reference], count: 1 });

      const result = await configurationsService.getReferences(
        'default',
        'github-mcp-url',
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/configurations/github-mcp-url/references',
        { params: { namespace: 'default' } },
      );
      expect(result).toEqual([reference]);
    });
  });
});
