import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError, apiClient } from '@/lib/api/client';
import {
  KubernetesKind,
  kubernetesResourcesService,
} from '@/lib/services/kubernetes-resources';

vi.mock('@/lib/api/client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/client')>(
      '@/lib/api/client',
    );

  return {
    APIError: actual.APIError,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const FORBIDDEN = {
  kind: 'Status',
  apiVersion: 'v1',
  metadata: {},
  status: 'Failure',
  message:
    'configmaps is forbidden: User "system:serviceaccount:default:ark-api-sa" cannot create resource "configmaps" in API group "" in the namespace "default"',
  reason: 'Forbidden',
  code: 403,
};

describe('kubernetesResourcesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when create returns a Kubernetes failure with a 200 status code', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(FORBIDDEN);

    const create = kubernetesResourcesService.create(KubernetesKind.CONFIG_MAP, {
      metadata: { name: 'mcp-url' },
    });

    await expect(create).rejects.toThrow(APIError);
    await expect(create).rejects.toThrow(/configmaps is forbidden/);
  });

  it('exposes the Kubernetes status code on the thrown error', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(FORBIDDEN);

    const error = await kubernetesResourcesService
      .create(KubernetesKind.CONFIG_MAP, { metadata: { name: 'mcp-url' } })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ status: 403, name: 'APIError' });
  });

  it('throws when get returns a not-found failure', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      kind: 'Status',
      status: 'Failure',
      message: 'configmaps "missing" not found',
      reason: 'NotFound',
      code: 404,
    });

    await expect(
      kubernetesResourcesService.get(KubernetesKind.CONFIG_MAP, 'missing'),
    ).rejects.toThrow(/not found/);
  });

  it('throws when list returns a failure instead of returning an empty list', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(FORBIDDEN);

    await expect(
      kubernetesResourcesService.list(KubernetesKind.CONFIG_MAP),
    ).rejects.toThrow(APIError);
  });

  it('accepts a successful status body from delete', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({
      kind: 'Status',
      status: 'Success',
    });

    await expect(
      kubernetesResourcesService.delete(KubernetesKind.CONFIG_MAP, 'mcp-url'),
    ).resolves.toBeUndefined();
  });

  it('accepts an empty body from delete', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    await expect(
      kubernetesResourcesService.delete(KubernetesKind.CONFIG_MAP, 'mcp-url'),
    ).resolves.toBeUndefined();
  });

  it('returns the resource unchanged on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      metadata: { name: 'mcp-url', uid: 'a' },
      data: { value: 'https://mcp.example.com' },
    });

    const resource = await kubernetesResourcesService.get(
      KubernetesKind.CONFIG_MAP,
      'mcp-url',
    );

    expect(resource.metadata.name).toBe('mcp-url');
    expect(resource.data).toEqual({ value: 'https://mcp.example.com' });
  });
});
