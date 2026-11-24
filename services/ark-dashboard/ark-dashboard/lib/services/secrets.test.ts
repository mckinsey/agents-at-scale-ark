import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';

import { secretsService } from './secrets';

vi.mock('@/lib/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockGet = vi.mocked(apiClient.get);

describe('secretsService.getAll', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ items: [], count: 0 });
  });

  it('asks for shared secrets when no scope is given', async () => {
    await secretsService.getAll('default');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/secrets', {
      params: { namespace: 'default', scope: 'shared' },
    });
  });

  it('sends the requested scope with the namespace', async () => {
    await secretsService.getAll('team-a', 'all');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/secrets', {
      params: { namespace: 'team-a', scope: 'all' },
    });
  });

  it('returns the items of the list response', async () => {
    const item = {
      id: 'u-0123456789abcdef-openai',
      name: 'u-0123456789abcdef-openai',
      display_name: 'openai',
      scope: 'personal',
      labels: [],
    };
    mockGet.mockResolvedValue({ items: [item], count: 1 });

    expect(await secretsService.getAll('default', 'personal')).toEqual([item]);
  });
});

describe('secretsService.get', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('fetches a single secret by name and returns its key names', async () => {
    mockGet.mockResolvedValue({
      name: 'aws-credentials',
      id: 'abc',
      type: 'Opaque',
      secret_length: 32,
      keys: ['accessKeyId', 'secretAccessKey'],
    });

    const secret = await secretsService.get('default', 'aws-credentials');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/secrets/aws-credentials', { params: { namespace: 'default' } });
    expect(secret.keys).toEqual(['accessKeyId', 'secretAccessKey']);
  });
});
