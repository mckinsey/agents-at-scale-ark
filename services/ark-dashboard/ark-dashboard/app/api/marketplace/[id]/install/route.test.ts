import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSpawn } = vi.hoisted(() => {
  const mockSpawn = vi.fn();
  return { mockSpawn };
});

vi.mock('node:child_process', () => {
  const mod = { spawn: mockSpawn };
  return { default: mod, ...mod };
});

vi.mock('@/lib/services/marketplace-server', () => ({
  getRawMarketplaceItemById: vi.fn(),
}));

import { POST, DELETE } from './route';
import { getRawMarketplaceItemById } from '@/lib/services/marketplace-server';

const mockGetRawMarketplaceItemById = vi.mocked(getRawMarketplaceItemById);

function mockSpawnSuccess(result: { stdout: string; stderr: string }) {
  mockSpawn.mockReturnValueOnce({
    stdout: {
      on: (event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          handler(Buffer.from(result.stdout));
        }
      },
    },
    stderr: {
      on: (event: string, handler: (data: Buffer) => void) => {
        if (event === 'data') {
          handler(Buffer.from(result.stderr));
        }
      },
    },
    on: (event: string, handler: (code: number) => void) => {
      if (event === 'close') {
        setTimeout(() => handler(0), 0);
      }
      if (event === 'error') {
        // No error
      }
    },
    kill: vi.fn(),
  });
}

function mockSpawnFailure(error: Error) {
  mockSpawn.mockReturnValueOnce({
    stdout: {
      on: () => {},
    },
    stderr: {
      on: () => {},
    },
    on: (event: string, handler: (error: Error) => void) => {
      if (event === 'error') {
        setTimeout(() => handler(error), 0);
      }
      if (event === 'close') {
        // No close event
      }
    },
    kill: vi.fn(),
  });
}

function createRequest(url: string, options?: RequestInit) {
  const parsed = new URL(url, 'http://localhost');
  if (!parsed.searchParams.has('namespace')) {
    parsed.searchParams.set('namespace', 'team-a');
  }
  return new NextRequest(parsed, options);
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

  it('should use executors in arkCommand for executor type', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      type: 'executor',
    });

    const request = createRequest('http://localhost/api/marketplace/my-executor/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'my-executor' }) });
    const data = await response.json();

    expect(data.arkCommand).toBe('ark install marketplace/executors/my-executor');
  });

  it('always returns command mode and never spawns helm, even when mode is not command', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('command');
    expect(data.helmCommand).toBeDefined();
    expect(mockSpawn).not.toHaveBeenCalled();
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

  it('should reject invalid helmReleaseName', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      ark: {
        helmReleaseName: 'INVALID-NAME', // uppercase not allowed
        chartPath: 'oci://example.com/chart',
      },
    });

    const request = createRequest('http://localhost/api/marketplace/invalid/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'invalid' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Validation failed');
  });

  it('should reject invalid namespace', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      ark: {
        helmReleaseName: 'phoenix',
        chartPath: 'oci://example.com/chart',
        namespace: 'INVALID-NS', // uppercase not allowed
      },
    });

    const request = createRequest('http://localhost/api/marketplace/invalid/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'command' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'invalid' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Validation failed');
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

  it('should return the uninstall command and not spawn helm', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('command');
    expect(data.helmCommand).toBe('helm uninstall phoenix');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should include --namespace in the uninstall command when namespace is set', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({
      ...baseItem,
      ark: { ...baseItem.ark, namespace: 'monitoring' },
    });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('command');
    expect(data.helmCommand).toContain('--namespace monitoring');
    expect(mockSpawn).not.toHaveBeenCalled();
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
});
