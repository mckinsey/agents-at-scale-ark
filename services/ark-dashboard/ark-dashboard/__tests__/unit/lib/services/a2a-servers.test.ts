import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import {
  A2AServersService,
  hasEndpointPathMismatch,
  summarizeA2AServerStatus,
} from '@/lib/services/a2a-servers';

vi.mock('@/lib/api/client');

describe('A2AServersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delete', () => {
    it('should call delete endpoint with correct identifier', async () => {
      const mockDelete = vi
        .spyOn(apiClient, 'delete')
        .mockResolvedValue(undefined);

      await A2AServersService.delete('default', 'test-server');

      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/a2a-servers/test-server',
        { params: { namespace: 'default' } },
      );
    });

    it('should handle delete errors', async () => {
      const mockError = new Error('Delete failed');
      vi.spyOn(apiClient, 'delete').mockRejectedValue(mockError);

      await expect(
        A2AServersService.delete('default', 'test-server'),
      ).rejects.toThrow('Delete failed');
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

      const result = await A2AServersService.create('default', config);

      expect(mockPost).toHaveBeenCalledWith('/api/v1/a2a-servers', config, {
        params: { namespace: 'default' },
      });
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

      const result = await A2AServersService.update(
        'default',
        'test-server',
        spec,
      );

      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/a2a-servers/test-server',
        spec,
        { params: { namespace: 'default' } },
      );
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', 'test-server');
    });
  });
});

describe('summarizeA2AServerStatus', () => {
  it('reads the agent card fields from the raw status', () => {
    const summary = summarizeA2AServerStatus({
      lastResolvedEndpoint: 'http://simple-agent.default.svc.cluster.local:80',
      negotiatedProtocol: 'v0.2.x',
      cardVersion: '1.0.0',
      streamingSupported: false,
      skillCount: 3,
      conditions: [{ type: 'Ready', status: 'True' }],
    });

    expect(summary).toMatchObject({
      ready: true,
      endpoint: 'http://simple-agent.default.svc.cluster.local:80',
      negotiatedProtocol: 'v0.2.x',
      cardVersion: '1.0.0',
      streamingSupported: false,
      skillCount: 3,
    });
  });

  it('leaves the agent card fields undefined before discovery', () => {
    const summary = summarizeA2AServerStatus({ conditions: [] });

    expect(summary.negotiatedProtocol).toBeUndefined();
    expect(summary.cardVersion).toBeUndefined();
    expect(summary.streamingSupported).toBeUndefined();
    expect(summary.skillCount).toBeUndefined();
  });
});

describe('hasEndpointPathMismatch', () => {
  it('flags a card that asks for a different path than the endpoint', () => {
    expect(
      hasEndpointPathMismatch(
        'https://agentcore.example.com/a2a/',
        'https://agentcore.example.com/a2a/message',
      ),
    ).toBe(true);
  });

  it('ignores a card that only advertises a different host', () => {
    expect(
      hasEndpointPathMismatch(
        'http://simple-agent.default.svc.cluster.local:80',
        'http://localhost:8000',
      ),
    ).toBe(false);
  });

  it('ignores trailing slashes', () => {
    expect(
      hasEndpointPathMismatch(
        'http://a.example.com/a2a/',
        'http://a.example.com/a2a',
      ),
    ).toBe(false);
  });

  it('does not flag missing or invalid URLs', () => {
    expect(hasEndpointPathMismatch(undefined, 'http://a.example.com')).toBe(
      false,
    );
    expect(hasEndpointPathMismatch('http://a.example.com', 'not a url')).toBe(
      false,
    );
  });
});
