import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mcpServersService } from '@/lib/services/mcp-servers';
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

const mockMcpServer = { name: 'test-mcp', id: 'test-mcp' };

describe('mcpServersService namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create passes namespace', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockMcpServer);
    await mcpServersService.create({ name: 'test-mcp' } as never, {
      namespace: 'ns1',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/mcp-servers',
      { name: 'test-mcp' },
      { params: { namespace: 'ns1' } },
    );
  });

  it('update passes namespace', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(mockMcpServer);
    await mcpServersService.update('test-mcp', { spec: {} } as never, {
      namespace: 'ns1',
    });
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/mcp-servers/test-mcp',
      { spec: {} },
      { params: { namespace: 'ns1' } },
    );
  });

  it('delete passes namespace', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);
    await mcpServersService.delete('test-mcp', { namespace: 'ns1' });
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/v1/mcp-servers/test-mcp',
      { params: { namespace: 'ns1' } },
    );
  });
});
