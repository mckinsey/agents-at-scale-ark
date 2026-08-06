import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { secretsService } from '@/lib/services/secrets';
import {
  ALIAS_ANNOTATION,
  DESCRIPTION_ANNOTATION,
} from '@/lib/utils/resource-metadata';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const SECRET_PATH = '/api/v1/resources/api/v1/Secret';

describe('secretsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('populates description, alias, labels and value from the resource', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        metadata: {
          name: 'api-key-production',
          uid: 'abc',
          annotations: {
            [DESCRIPTION_ANNOTATION]: 'Key used by the production models',
            [ALIAS_ANNOTATION]: 'api-key',
          },
          labels: { prod: '', eu: '' },
        },
        type: 'Opaque',
        data: { token: btoa('super-secret') },
      });

      const secret = await secretsService.get('api-key-production');

      expect(apiClient.get).toHaveBeenCalledWith(
        `${SECRET_PATH}/api-key-production`,
      );
      expect(secret.description).toBe('Key used by the production models');
      expect(secret.alias).toBe('api-key');
      expect(secret.labels).toEqual(['prod', 'eu']);
      expect(secret.value).toBe('super-secret');
    });

    it('leaves metadata null when the secret has no Ark annotations', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        metadata: { name: 'github-pat', uid: 'abc', annotations: null },
        type: 'Opaque',
        data: { token: btoa('ghp_x') },
      });

      const secret = await secretsService.get('github-pat');

      expect(secret.description).toBeNull();
      expect(secret.alias).toBeNull();
      expect(secret.labels).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('normalises metadata for every item', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        items: [
          {
            metadata: {
              name: 'api-key-production',
              uid: 'a',
              annotations: { [ALIAS_ANNOTATION]: 'api-key' },
              labels: { prod: '' },
            },
          },
          { metadata: { name: 'github-pat', uid: 'b', annotations: {} } },
        ],
      });

      const secrets = await secretsService.getAll();

      expect(apiClient.get).toHaveBeenCalledWith(SECRET_PATH);
      expect(secrets[0].alias).toBe('api-key');
      expect(secrets[0].labels).toEqual(['prod']);
      expect(secrets[1].alias).toBeNull();
      expect(secrets[1].labels).toEqual([]);
    });
  });

  describe('create', () => {
    it('sends metadata as annotations and Kubernetes labels', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        metadata: { name: 'api-key-production', uid: 'a' },
      });

      await secretsService.create('api-key-production', 'secret-value', {
        description: 'Production key',
        alias: 'api-key',
        labels: ['prod', 'eu'],
      });

      expect(apiClient.post).toHaveBeenCalledWith(SECRET_PATH, {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'api-key-production',
          annotations: {
            [DESCRIPTION_ANNOTATION]: 'Production key',
            [ALIAS_ANNOTATION]: 'api-key',
          },
          labels: { prod: '', eu: '' },
        },
        type: 'Opaque',
        data: {},
        stringData: { token: 'secret-value' },
      });
    });

    it('omits empty metadata', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        metadata: { name: 'api-key', uid: 'a' },
      });

      await secretsService.create('api-key', 'secret-value', {
        description: '',
        alias: null,
        labels: [],
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        SECRET_PATH,
        expect.objectContaining({
          metadata: { name: 'api-key', annotations: {}, labels: {} },
        }),
      );
    });
  });

  describe('update', () => {
    const existing = {
      metadata: {
        name: 'api-key',
        uid: 'a',
        annotations: { [DESCRIPTION_ANNOTATION]: 'Production key' },
        labels: { prod: '' },
      },
      type: 'Opaque',
      data: { token: btoa('old-value'), extra: btoa('keep-me') },
    };

    it('uses the typed endpoint when only the value changed', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(existing);
      vi.mocked(apiClient.put).mockResolvedValueOnce({});

      const updated = await secretsService.update('api-key', 'new-value', {
        description: 'Production key',
        alias: null,
        labels: ['prod'],
      });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/secrets/api-key', {
        string_data: { token: 'new-value' },
      });
      expect(apiClient.delete).not.toHaveBeenCalled();
      expect(updated.value).toBe('new-value');
    });

    it('recreates the secret when metadata changed, preserving other keys', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(existing);
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        metadata: { name: 'api-key', uid: 'a' },
      });

      await secretsService.update('api-key', 'new-value', {
        description: 'Rotated key',
        alias: null,
        labels: ['prod'],
      });

      expect(apiClient.delete).toHaveBeenCalledWith(`${SECRET_PATH}/api-key`);
      expect(apiClient.post).toHaveBeenCalledWith(SECRET_PATH, {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'api-key',
          annotations: { [DESCRIPTION_ANNOTATION]: 'Rotated key' },
          labels: { prod: '' },
        },
        type: 'Opaque',
        data: existing.data,
        stringData: { token: 'new-value' },
      });
      expect(apiClient.put).not.toHaveBeenCalled();
    });
  });
});
