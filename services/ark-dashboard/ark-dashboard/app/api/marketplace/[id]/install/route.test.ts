import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockExec } = vi.hoisted(() => {
  const mockExec = vi.fn();
  return { mockExec };
});

vi.mock('child_process', () => {
  const mod = { exec: mockExec };
  return { default: mod, ...mod };
});

vi.mock('@/lib/services/marketplace-fetcher', () => ({
  getRawMarketplaceItemById: vi.fn(),
}));

import { POST, DELETE } from './route';
import { getRawMarketplaceItemById } from '@/lib/services/marketplace-fetcher';

const mockGetRawMarketplaceItemById = vi.mocked(getRawMarketplaceItemById);

function mockExecSuccess(result: { stdout: string; stderr: string }) {
  mockExec.mockImplementationOnce(
    (_cmd: string, callback: (err: null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, result);
    },
  );
}

function mockExecFailure(error: unknown) {
  mockExec.mockImplementationOnce((_cmd: string, callback: (err: unknown) => void) => {
    callback(error);
  });
}

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

const baseItem = {
  name: 'Phoenix',
  description: 'Observability platform',
  type: 'service' as const,
  ark: {
    chartPath: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/phoenix',
    helmReleaseName: 'phoenix',
  },
};

describe('POST /api/marketplace/[id]/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 404 when item not found', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost/api/marketplace/nonexistent/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Marketplace item not found');
  });

  it('should return 400 when no ark config', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      name: 'No Config',
      description: 'No ark config',
    });

    const request = createRequest('http://localhost/api/marketplace/no-config/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'no-config' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Item does not have installation configuration');
  });

  it('should return helm and ark commands in command mode', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('command');
    expect(data.helmCommand).toBe(
      'helm upgrade --install phoenix oci://ghcr.io/mckinsey/agents-at-scale-marketplace/phoenix',
    );
    expect(data.arkCommand).toBe('ark install marketplace/services/phoenix');
  });

  it('should include --namespace in helmCommand when namespace is set', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      ark: { ...baseItem.ark, namespace: 'monitoring' },
    });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.helmCommand).toContain('--namespace monitoring');
    expect(data.namespace).toBe('monitoring');
  });

  it('should include extra args in helmCommand when installArgs present', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      ark: { ...baseItem.ark, installArgs: ['--set', 'key=value'] },
    });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.helmCommand).toContain('--set key=value');
  });

  it('should use agents in arkCommand for non-service type', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      type: 'agent',
    });

    const request = createRequest('http://localhost/api/marketplace/my-agent/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'my-agent' }) });
    const data = await response.json();

    expect(data.arkCommand).toBe('ark install marketplace/agents/my-agent');
  });

  it('should execute helm and return success in direct mode when helm available', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'v3.12.0', stderr: '' });
    mockExecSuccess({ stdout: 'release "phoenix" installed', stderr: '' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('installed');
    expect(data.message).toBe('Successfully installed Phoenix');
  });

  it('should fall back to command response when helm not available in direct mode', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecFailure(new Error('helm not found'));

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('command');
    expect(data.helmCommand).toBeDefined();
  });

  it('should fall back to command response when helm execution fails in direct mode', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'v3.12.0', stderr: '' });
    mockExecFailure(new Error('helm install failed'));

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('command');
    expect(data.helmCommand).toBeDefined();
  });

  it('should default to command mode when request body is invalid', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: 'invalid json',
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('command');
    expect(data.helmCommand).toBeDefined();
  });

  it('should return 500 when params rejects', async () => {
    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.reject(new Error('bad params')) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to install marketplace item');
  });

  it('should log stderr when helm produces non-WARNING stderr in direct mode', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'v3.12.0', stderr: '' });
    mockExecSuccess({ stdout: 'installed', stderr: 'some error output' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('installed');
  });

  it('should not log stderr when it only contains WARNING in direct mode', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'v3.12.0', stderr: '' });
    mockExecSuccess({ stdout: 'installed', stderr: 'WARNING: some warning' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('installed');
  });
});

describe('DELETE /api/marketplace/[id]/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 404 when item not found', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce(null);

    const request = createRequest('http://localhost/api/marketplace/nonexistent/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Marketplace item not found');
  });

  it('should return 400 when no helmReleaseName', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      name: 'No Release',
      description: 'No helm release',
      ark: { chartPath: 'some/path' },
    });

    const request = createRequest('http://localhost/api/marketplace/no-release/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'no-release' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Item does not have uninstallation configuration');
  });

  it('should execute helm uninstall and return success', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'release "phoenix" uninstalled', stderr: '' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('uninstalled');
    expect(data.message).toBe('Successfully uninstalled Phoenix');
  });

  it('should include --namespace when namespace is set', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      ark: { ...baseItem.ark, namespace: 'monitoring' },
    });
    mockExecSuccess({ stdout: 'uninstalled', stderr: '' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('uninstalled');
    expect(mockExec).toHaveBeenCalledWith(
      'helm uninstall phoenix --namespace monitoring',
      expect.any(Function),
    );
  });

  it('should return 500 with error details when helm fails', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecFailure(new Error('release not found'));

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Uninstallation failed');
    expect(data.details).toBe('release not found');
  });

  it('should return 500 when params rejects', async () => {
    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.reject(new Error('bad params')) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to uninstall marketplace item');
  });

  it('should handle non-Error thrown during helm uninstall', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecFailure('string error');

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.details).toBe('Unknown error');
  });

  it('should not log stderr when it contains WARNING', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'uninstalled', stderr: 'WARNING: something' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('uninstalled');
  });

  it('should log stderr when it contains non-WARNING content', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecSuccess({ stdout: 'uninstalled', stderr: 'actual error' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('uninstalled');
  });
});
