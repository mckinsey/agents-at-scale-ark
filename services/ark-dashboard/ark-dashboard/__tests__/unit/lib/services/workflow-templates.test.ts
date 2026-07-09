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
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
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

  describe('save', () => {
    const validYaml = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: my-template
spec:
  entrypoint: main`;

    it('should POST the parsed object to the collection endpoint on create', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockWorkflowTemplate);

      const result = await workflowTemplatesService.save(validYaml, 'create');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate',
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'WorkflowTemplate',
          metadata: { name: 'my-template' },
          spec: { entrypoint: 'main' },
        },
      );
      expect(result).toEqual(mockWorkflowTemplate);
    });

    it('should PUT the parsed object to the named endpoint on update', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockWorkflowTemplate);

      const result = await workflowTemplatesService.save(validYaml, 'update');

      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/my-template',
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'WorkflowTemplate',
          metadata: { name: 'my-template' },
          spec: { entrypoint: 'main' },
        },
      );
      expect(result).toEqual(mockWorkflowTemplate);
    });

    it('should reject YAML whose kind is not WorkflowTemplate', async () => {
      const wrongKind = `apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: my-template`;

      await expect(
        workflowTemplatesService.save(wrongKind, 'create'),
      ).rejects.toThrow('WorkflowTemplate');
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('should reject unparseable YAML', async () => {
      const badYaml = 'kind: WorkflowTemplate\n  bad: : indentation';

      await expect(
        workflowTemplatesService.save(badYaml, 'create'),
      ).rejects.toThrow('Invalid YAML');
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('should reject YAML that is not a mapping', async () => {
      await expect(
        workflowTemplatesService.save('- just\n- a\n- list', 'create'),
      ).rejects.toThrow('mapping');
    });

    it('should require metadata.name on update', async () => {
      const noName = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main`;

      await expect(
        workflowTemplatesService.save(noName, 'update'),
      ).rejects.toThrow('metadata.name');
      expect(apiClient.put).not.toHaveBeenCalled();
    });
  });

  describe('nameExists', () => {
    it('should return true when a template with the name exists', async () => {
      const mockListResponse: WorkflowTemplateList = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplateList',
        items: [mockWorkflowTemplate],
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse);

      const result = await workflowTemplatesService.nameExists('test-template');

      expect(result).toBe(true);
    });

    it('should return false when no template matches the name', async () => {
      const mockListResponse: WorkflowTemplateList = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplateList',
        items: [mockWorkflowTemplate],
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse);

      const result = await workflowTemplatesService.nameExists('other');

      expect(result).toBe(false);
    });
  });

  describe('canCreate / canUpdate', () => {
    it('should check create access on workflowtemplates', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ allowed: true });

      const result = await workflowTemplatesService.canCreate();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/resources/access-review',
        {
          group: 'argoproj.io',
          resource: 'workflowtemplates',
          verb: 'create',
        },
      );
      expect(result).toBe(true);
    });

    it('should check update access on workflowtemplates', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ allowed: false });

      const result = await workflowTemplatesService.canUpdate();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/resources/access-review',
        {
          group: 'argoproj.io',
          resource: 'workflowtemplates',
          verb: 'update',
        },
      );
      expect(result).toBe(false);
    });
  });
});
