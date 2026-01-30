import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowsService } from '@/lib/services/workflows';
import { apiClient } from '@/lib/api/client';
import type { ArgoWorkflow, ArgoWorkflowList } from '@/lib/types/argo-workflow';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('workflowsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should list workflows without filters', async () => {
      const mockWorkflows: ArgoWorkflow[] = [
        {
          metadata: { name: 'workflow-1', namespace: 'default' },
          spec: {},
          status: { phase: 'Running' },
        } as ArgoWorkflow,
      ];

      vi.mocked(apiClient.get).mockResolvedValue({
        items: mockWorkflows,
      } as ArgoWorkflowList);

      const result = await workflowsService.list('default');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=default'
      );
      expect(result).toEqual(mockWorkflows);
    });

    it('should list workflows with workflowName filter', async () => {
      const mockWorkflows: ArgoWorkflow[] = [
        {
          metadata: { name: 'test-workflow', namespace: 'default' },
          spec: {},
          status: { phase: 'Running' },
        } as ArgoWorkflow,
      ];

      vi.mocked(apiClient.get).mockResolvedValue({
        items: mockWorkflows,
      } as ArgoWorkflowList);

      const result = await workflowsService.list('default', {
        workflowName: 'test',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=default&workflowName=test'
      );
      expect(result).toEqual(mockWorkflows);
    });

    it('should list workflows with workflowTemplateName filter', async () => {
      const mockWorkflows: ArgoWorkflow[] = [];

      vi.mocked(apiClient.get).mockResolvedValue({
        items: mockWorkflows,
      } as ArgoWorkflowList);

      await workflowsService.list('prod', {
        workflowTemplateName: 'my-template',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=prod&workflowTemplateName=my-template'
      );
    });

    it('should list workflows with status filter', async () => {
      const mockWorkflows: ArgoWorkflow[] = [];

      vi.mocked(apiClient.get).mockResolvedValue({
        items: mockWorkflows,
      } as ArgoWorkflowList);

      await workflowsService.list('default', {
        status: 'succeeded',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=default&status=succeeded'
      );
    });

    it('should list workflows with all filters', async () => {
      const mockWorkflows: ArgoWorkflow[] = [];

      vi.mocked(apiClient.get).mockResolvedValue({
        items: mockWorkflows,
      } as ArgoWorkflowList);

      await workflowsService.list('custom-ns', {
        workflowName: 'prod',
        workflowTemplateName: 'ci-template',
        status: 'running',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow?namespace=custom-ns&workflowName=prod&workflowTemplateName=ci-template&status=running'
      );
    });
  });

  describe('get', () => {
    it('should get a single workflow', async () => {
      const mockWorkflow: ArgoWorkflow = {
        metadata: { name: 'my-workflow', namespace: 'default' },
        spec: {},
        status: { phase: 'Succeeded' },
      } as ArgoWorkflow;

      vi.mocked(apiClient.get).mockResolvedValue(mockWorkflow);

      const result = await workflowsService.get('my-workflow');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow/my-workflow?namespace=default'
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should get a workflow from custom namespace', async () => {
      const mockWorkflow: ArgoWorkflow = {
        metadata: { name: 'test-wf', namespace: 'prod' },
        spec: {},
        status: { phase: 'Running' },
      } as ArgoWorkflow;

      vi.mocked(apiClient.get).mockResolvedValue(mockWorkflow);

      const result = await workflowsService.get('test-wf', 'prod');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow/test-wf?namespace=prod'
      );
      expect(result).toEqual(mockWorkflow);
    });
  });

  describe('getYaml', () => {
    it('should get workflow as YAML', async () => {
      const mockYaml = 'apiVersion: argoproj.io/v1alpha1\nkind: Workflow';

      vi.mocked(apiClient.get).mockResolvedValue(mockYaml);

      const result = await workflowsService.getYaml('my-workflow');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow/my-workflow?namespace=default',
        {
          headers: {
            Accept: 'application/yaml',
          },
        }
      );
      expect(result).toBe(mockYaml);
    });

    it('should get workflow YAML from custom namespace', async () => {
      const mockYaml = 'apiVersion: argoproj.io/v1alpha1\nkind: Workflow';

      vi.mocked(apiClient.get).mockResolvedValue(mockYaml);

      await workflowsService.getYaml('test-wf', 'staging');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/Workflow/test-wf?namespace=staging',
        {
          headers: {
            Accept: 'application/yaml',
          },
        }
      );
    });
  });

  describe('getPodLogs', () => {
    it('should get pod logs without container', async () => {
      const mockLogs = 'Log line 1\nLog line 2';

      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      const result = await workflowsService.getPodLogs('pod-123');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/api/v1/namespaces/default/pods/pod-123/log?tailLines=1000',
        {
          headers: {
            Accept: 'text/plain',
          },
        }
      );
      expect(result).toBe(mockLogs);
    });

    it('should get pod logs with container', async () => {
      const mockLogs = 'Container logs';

      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      const result = await workflowsService.getPodLogs(
        'pod-456',
        'default',
        'main'
      );

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/api/v1/namespaces/default/pods/pod-456/log?tailLines=1000&container=main',
        {
          headers: {
            Accept: 'text/plain',
          },
        }
      );
      expect(result).toBe(mockLogs);
    });

    it('should get pod logs from custom namespace', async () => {
      const mockLogs = 'Logs from custom namespace';

      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      await workflowsService.getPodLogs('pod-789', 'prod', 'sidecar');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/api/v1/namespaces/prod/pods/pod-789/log?tailLines=1000&container=sidecar',
        {
          headers: {
            Accept: 'text/plain',
          },
        }
      );
    });
  });

  describe('getWorkflowLogs', () => {
    it('should get workflow logs', async () => {
      const mockLogs = 'Workflow node logs';

      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      const result = await workflowsService.getWorkflowLogs(
        'my-workflow',
        'node-id-123'
      );

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/namespaces/default/workflows/my-workflow/node-id-123/log',
        {
          headers: {
            Accept: 'text/plain',
          },
        }
      );
      expect(result).toBe(mockLogs);
    });

    it('should get workflow logs from custom namespace', async () => {
      const mockLogs = 'Custom namespace workflow logs';

      vi.mocked(apiClient.get).mockResolvedValue(mockLogs);

      await workflowsService.getWorkflowLogs(
        'test-workflow',
        'node-456',
        'staging'
      );

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/namespaces/staging/workflows/test-workflow/node-456/log',
        {
          headers: {
            Accept: 'text/plain',
          },
        }
      );
    });
  });

  describe('submitFromTemplate', () => {
    it('should submit workflow from template', async () => {
      const mockWorkflow: ArgoWorkflow = {
        metadata: { name: 'submitted-workflow', namespace: 'default' },
        spec: {},
        status: { phase: 'Pending' },
      } as ArgoWorkflow;

      vi.mocked(apiClient.get).mockResolvedValue(mockWorkflow);

      const result = await workflowsService.submitFromTemplate(
        'my-template',
        { param1: 'value1' }
      );

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/my-template/submit?namespace=default',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          data: { param1: 'value1' },
        }
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should submit workflow from template in custom namespace', async () => {
      const mockWorkflow: ArgoWorkflow = {
        metadata: { name: 'prod-workflow', namespace: 'prod' },
        spec: {},
        status: { phase: 'Running' },
      } as ArgoWorkflow;

      vi.mocked(apiClient.get).mockResolvedValue(mockWorkflow);

      await workflowsService.submitFromTemplate(
        'prod-template',
        { env: 'production' },
        'prod'
      );

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/resources/apis/argoproj.io/v1alpha1/WorkflowTemplate/prod-template/submit?namespace=prod',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          data: { env: 'production' },
        }
      );
    });
  });
});
