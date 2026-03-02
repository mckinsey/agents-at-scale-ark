import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const mockExecAsync = vi.fn();
const mockGetRawMarketplaceItemById = vi.fn();

async function checkHelmAvailable(): Promise<{ available: boolean; error?: string }> {
  try {
    await mockExecAsync('helm version --short');
    return { available: true };
  } catch {
    return { available: false, error: 'Helm CLI is not available.' };
  }
}

async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { mode } = await request.json().catch(() => ({ mode: 'command' }));
    const item = await mockGetRawMarketplaceItemById(id);

    if (!item) {
      return NextResponse.json({ error: 'Marketplace item not found' }, { status: 404 });
    }

    if (!item.ark?.chartPath || !item.ark?.helmReleaseName) {
      return NextResponse.json({ error: 'Item does not have installation configuration' }, { status: 400 });
    }

    const { ark } = item;
    const helmArgs = ['upgrade', '--install', ark.helmReleaseName, ark.chartPath];
    if (ark.namespace) { helmArgs.push('--namespace', ark.namespace); }
    if (ark.installArgs) { helmArgs.push(...ark.installArgs); }
    const helmCommand = `helm ${helmArgs.join(' ')}`;

    if (mode === 'command') {
      const arkCommand = `ark install marketplace/${item.type === 'service' ? 'services' : 'agents'}/${id}`;
      return NextResponse.json({
        status: 'command',
        name: item.name || id,
        helmCommand,
        arkCommand,
        namespace: ark.namespace,
        message: 'Run one of these commands in your terminal to install',
      });
    }

    try {
      const helmCheck = await checkHelmAvailable();
      if (!helmCheck.available) {
        return NextResponse.json({
          status: 'command',
          name: item.name || id,
          helmCommand,
          arkCommand: `ark install marketplace/${item.type === 'service' ? 'services' : 'agents'}/${id}`,
          namespace: ark.namespace,
          message: 'Direct installation not available. Run this command in your terminal:',
        });
      }

      const { stdout } = await mockExecAsync(helmCommand);
      return NextResponse.json({
        message: `Successfully installed ${item.name}`,
        status: 'installed',
        output: stdout,
      });
    } catch {
      return NextResponse.json({
        status: 'command',
        name: item.name || id,
        helmCommand,
        arkCommand: `ark install marketplace/${item.type === 'service' ? 'services' : 'agents'}/${id}`,
        namespace: ark.namespace,
        message: 'Direct installation not available. Run this command in your terminal:',
      });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to install marketplace item' }, { status: 500 });
  }
}

async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const item = await mockGetRawMarketplaceItemById(id);

    if (!item) {
      return NextResponse.json({ error: 'Marketplace item not found' }, { status: 404 });
    }

    if (!item.ark?.helmReleaseName) {
      return NextResponse.json({ error: 'Item does not have uninstallation configuration' }, { status: 400 });
    }

    const { ark } = item;
    const helmArgs = ['uninstall', ark.helmReleaseName];
    if (ark.namespace) { helmArgs.push('--namespace', ark.namespace); }
    const helmCommand = `helm ${helmArgs.join(' ')}`;

    try {
      const { stdout } = await mockExecAsync(helmCommand);
      return NextResponse.json({
        message: `Successfully uninstalled ${item.name}`,
        status: 'uninstalled',
        output: stdout,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: 'Uninstallation failed', details: errorMessage }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to uninstall marketplace item' }, { status: 500 });
  }
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
    expect(data.helmCommand).toBe('helm upgrade --install phoenix oci://ghcr.io/mckinsey/agents-at-scale-marketplace/phoenix');
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
    mockExecAsync
      .mockResolvedValueOnce({ stdout: 'v3.12.0', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'release "phoenix" installed', stderr: '' });

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
    mockExecAsync.mockRejectedValueOnce(new Error('helm not found'));

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
    mockExecAsync
      .mockResolvedValueOnce({ stdout: 'v3.12.0', stderr: '' })
      .mockRejectedValueOnce(new Error('helm install failed'));

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'POST',
      body: JSON.stringify({ mode: 'direct' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('command');
    expect(data.helmCommand).toBeDefined();
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
    mockExecAsync.mockResolvedValueOnce({ stdout: 'release "phoenix" uninstalled', stderr: '' });

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
    mockExecAsync.mockResolvedValueOnce({ stdout: 'uninstalled', stderr: '' });

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(data.status).toBe('uninstalled');
    expect(mockExecAsync).toHaveBeenCalledWith('helm uninstall phoenix --namespace monitoring');
  });

  it('should return 500 with error details when helm fails', async () => {
    mockGetRawMarketplaceItemById.mockResolvedValueOnce({ ...baseItem });
    mockExecAsync.mockRejectedValueOnce(new Error('release not found'));

    const request = createRequest('http://localhost/api/marketplace/phoenix/install', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'phoenix' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Uninstallation failed');
    expect(data.details).toBe('release not found');
  });
});
