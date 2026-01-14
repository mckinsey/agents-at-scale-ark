import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import type {
  WorkflowTemplate,
  WorkflowTemplateList,
} from '@/lib/services/workflow-templates';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

interface ErrorWithResponse extends Error {
  response?: { status: number };
}

describe('workflowTemplatesService', () => {
  const mockWorkflowTemplate: WorkflowTemplate = {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'WorkflowTemplate',
    metadata: {
      name: 'test-template',
      namespace: 'default',
      annotations: {
        description: 'A test workflow template',
      },
      labels: {
        app: 'test',
      },
      creationTimestamp: '2026-01-12T00:00:00Z',
    },
    spec: {
      entrypoint: 'main',
      templates: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should fetch all workflow templates and return items array', async () => {
      const mockListResponse: WorkflowTemplateList = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplateList',
        items: [
          mockWorkflowTemplate,
          {
            ...mockWorkflowTemplate,
            metadata: { ...mockWorkflowTemplate.metadata, name: 'template-2' },
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse);

      const result = await workflowTemplatesService.list();

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate',
      );
      expect(result).toHaveLength(2);
      expect(result[0].metadata.name).toBe('test-template');
      expect(result[1].metadata.name).toBe('template-2');
    });

    it('should return empty array when no templates exist', async () => {
      const mockListResponse: WorkflowTemplateList = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplateList',
        items: [],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse);

      const result = await workflowTemplatesService.list();

      expect(result).toEqual([]);
    });

    it('should handle list errors', async () => {
      const error = new Error('Server error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      await expect(workflowTemplatesService.list()).rejects.toThrow(
        'Server error',
      );
    });
  });

  describe('get', () => {
    it('should fetch workflow template by name', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockWorkflowTemplate);

      const result = await workflowTemplatesService.get('test-template');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-template',
      );
      expect(result).toEqual(mockWorkflowTemplate);
      expect(result.metadata.name).toBe('test-template');
    });

    it('should handle get errors', async () => {
      const error = new Error('Not found');
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      await expect(
        workflowTemplatesService.get('non-existent'),
      ).rejects.toThrow('Not found');
    });

    it('should handle 404 errors', async () => {
      const error: ErrorWithResponse = new Error('Not found');
      error.response = { status: 404 };
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      await expect(
        workflowTemplatesService.get('non-existent'),
      ).rejects.toThrow('Not found');
    });
  });

  describe('getYaml', () => {
    it('should fetch workflow template as YAML with correct headers', async () => {
      const mockYaml = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: test-template
  namespace: default
spec:
  entrypoint: main
  templates: []`;

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockYaml);

      const result = await workflowTemplatesService.getYaml('test-template');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/test-template',
        {
          headers: {
            Accept: 'application/yaml',
          },
        },
      );
      expect(result).toBe(mockYaml);
      expect(result).toContain('apiVersion: argoproj.io/v1alpha1');
      expect(result).toContain('kind: WorkflowTemplate');
    });

    it('should handle getYaml errors', async () => {
      const error = new Error('Server error');
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      await expect(
        workflowTemplatesService.getYaml('test-template'),
      ).rejects.toThrow('Server error');
    });

    it('should handle 404 errors for YAML requests', async () => {
      const error: ErrorWithResponse = new Error('Not found');
      error.response = { status: 404 };
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      await expect(
        workflowTemplatesService.getYaml('non-existent'),
      ).rejects.toThrow('Not found');
    });
  });
});
