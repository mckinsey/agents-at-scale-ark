import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { configurationsService } from '@/lib/services/configurations';
import {
  ALIAS_ANNOTATION,
  CONFIGURATION_ANNOTATION,
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

const CONFIG_MAP_PATH = '/api/v1/resources/api/v1/ConfigMap';

describe('configurationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('returns only config maps marked as Ark configurations', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        items: [
          {
            metadata: {
              name: 'mcp-url',
              uid: 'a',
              annotations: {
                [CONFIGURATION_ANNOTATION]: 'true',
                [DESCRIPTION_ANNOTATION]: 'MCP base url',
                [ALIAS_ANNOTATION]: 'mcp',
              },
              labels: { prod: '' },
            },
            data: { value: 'https://mcp.example.com' },
          },
          {
            metadata: { name: 'kube-root-ca.crt', uid: 'b' },
            data: { 'ca.crt': 'pem' },
          },
        ],
      });

      const configurations = await configurationsService.getAll();

      expect(apiClient.get).toHaveBeenCalledWith(CONFIG_MAP_PATH);
      expect(configurations).toHaveLength(1);
      expect(configurations[0]).toMatchObject({
        id: 'a',
        name: 'mcp-url',
        description: 'MCP base url',
        alias: 'mcp',
        labels: ['prod'],
      });
    });
  });

  describe('get', () => {
    it('reads the value and metadata from the config map', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        metadata: {
          name: 'mcp-url',
          uid: 'a',
          annotations: { [CONFIGURATION_ANNOTATION]: 'true' },
        },
        data: { value: 'https://mcp.example.com' },
      });

      const configuration = await configurationsService.get('mcp-url');

      expect(apiClient.get).toHaveBeenCalledWith(`${CONFIG_MAP_PATH}/mcp-url`);
      expect(configuration.value).toBe('https://mcp.example.com');
      expect(configuration.labels).toEqual([]);
    });
  });

  describe('create', () => {
    it('writes the value, annotations, labels and the Ark marker', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        metadata: { name: 'mcp-url', uid: 'a' },
        data: { value: 'https://mcp.example.com' },
      });

      await configurationsService.create({
        name: 'mcp-url',
        value: 'https://mcp.example.com',
        description: 'MCP base url',
        alias: 'mcp',
        labels: ['prod'],
      });

      expect(apiClient.post).toHaveBeenCalledWith(CONFIG_MAP_PATH, {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'mcp-url',
          annotations: {
            [DESCRIPTION_ANNOTATION]: 'MCP base url',
            [ALIAS_ANNOTATION]: 'mcp',
            [CONFIGURATION_ANNOTATION]: 'true',
          },
          labels: { prod: '' },
        },
        data: { value: 'https://mcp.example.com' },
      });
    });
  });

  describe('update', () => {
    it('recreates the config map, preserving foreign annotations and data', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        metadata: {
          name: 'mcp-url',
          uid: 'a',
          annotations: {
            [CONFIGURATION_ANNOTATION]: 'true',
            [DESCRIPTION_ANNOTATION]: 'Old description',
            'kubectl.kubernetes.io/last-applied-configuration': '{}',
            'team.example.com/owner': 'platform',
          },
          labels: { prod: '' },
        },
        data: { value: 'https://old.example.com', notes: 'keep-me' },
      });
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        metadata: { name: 'mcp-url', uid: 'a' },
        data: { value: 'https://new.example.com' },
      });

      await configurationsService.update('mcp-url', {
        value: 'https://new.example.com',
        description: 'New description',
        alias: null,
        labels: ['eu'],
      });

      expect(apiClient.delete).toHaveBeenCalledWith(
        `${CONFIG_MAP_PATH}/mcp-url`,
      );
      expect(apiClient.post).toHaveBeenCalledWith(CONFIG_MAP_PATH, {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'mcp-url',
          annotations: {
            'team.example.com/owner': 'platform',
            [DESCRIPTION_ANNOTATION]: 'New description',
            [CONFIGURATION_ANNOTATION]: 'true',
          },
          labels: { eu: '' },
        },
        data: { value: 'https://new.example.com', notes: 'keep-me' },
      });
    });
  });

  describe('delete', () => {
    it('deletes the config map', async () => {
      await configurationsService.delete('mcp-url');

      expect(apiClient.delete).toHaveBeenCalledWith(
        `${CONFIG_MAP_PATH}/mcp-url`,
      );
    });
  });
});
