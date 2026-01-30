import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  workflowsService,
  calculateDuration,
  getRootNodeId,
  getAllNodesFlat,
  buildNodeHierarchy,
} from '@/lib/services/workflows';
import { apiClient } from '@/lib/api/client';
import type {
  ArgoWorkflow,
  ArgoWorkflowList,
  ArgoNodeStatus,
} from '@/lib/types/argo-workflow';

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

});

describe('workflow utility functions', () => {
  describe('calculateDuration', () => {
    it('should return "Not started" when no start time', () => {
      const result = calculateDuration();
      expect(result).toBe('Not started');
    });

    it('should calculate duration in seconds', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T00:00:30Z');

      const result = calculateDuration(start.toISOString(), end.toISOString());
      expect(result).toBe('30s');
    });

    it('should calculate duration in minutes and seconds', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T00:02:30Z');

      const result = calculateDuration(start.toISOString(), end.toISOString());
      expect(result).toBe('2m 30s');
    });

    it('should calculate duration in hours and minutes', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T03:15:00Z');

      const result = calculateDuration(start.toISOString(), end.toISOString());
      expect(result).toBe('3h 15m');
    });

    it('should calculate duration in days and hours', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-03T05:00:00Z');

      const result = calculateDuration(start.toISOString(), end.toISOString());
      expect(result).toBe('2d 5h');
    });

    it('should use current time when no end time provided', () => {
      const start = new Date(Date.now() - 5000);
      const result = calculateDuration(start.toISOString());
      expect(result).toMatch(/[0-9]+s/);
    });
  });

  describe('getRootNodeId', () => {
    it('should return workflow name as root node id', () => {
      const workflow = {
        metadata: { name: 'my-workflow', namespace: 'default' },
        status: { nodes: { 'node-1': { id: 'node-1' } } },
      } as ArgoWorkflow;

      const result = getRootNodeId(workflow);
      expect(result).toBe('my-workflow');
    });

    it('should return null when no nodes', () => {
      const workflow = {
        metadata: { name: 'my-workflow', namespace: 'default' },
        status: {},
      } as ArgoWorkflow;

      const result = getRootNodeId(workflow);
      expect(result).toBeNull();
    });
  });

  describe('getAllNodesFlat', () => {
    it('should return all nodes as flat array', () => {
      const nodes = {
        'node-1': { id: 'node-1', name: 'Node 1' } as ArgoNodeStatus,
        'node-2': { id: 'node-2', name: 'Node 2' } as ArgoNodeStatus,
        'node-3': { id: 'node-3', name: 'Node 3' } as ArgoNodeStatus,
      };

      const result = getAllNodesFlat(nodes);
      expect(result).toHaveLength(3);
      expect(result.map(n => n.id)).toEqual(['node-1', 'node-2', 'node-3']);
    });

    it('should return empty array for empty nodes', () => {
      const result = getAllNodesFlat({});
      expect(result).toEqual([]);
    });
  });

  describe('buildNodeHierarchy', () => {
    it('should return null for non-existent node', () => {
      const nodes = {
        'node-1': { id: 'node-1', name: 'Node 1' } as ArgoNodeStatus,
      };

      const result = buildNodeHierarchy(nodes, 'non-existent');
      expect(result).toBeNull();
    });

    it('should build node without children', () => {
      const nodes = {
        'node-1': { id: 'node-1', name: 'Node 1' } as ArgoNodeStatus,
      };

      const result = buildNodeHierarchy(nodes, 'node-1');
      expect(result).toEqual({ id: 'node-1', name: 'Node 1' });
    });

    it('should build node with children', () => {
      const nodes = {
        'root': {
          id: 'root',
          name: 'Root',
          children: ['child-1', 'child-2']
        } as ArgoNodeStatus,
        'child-1': { id: 'child-1', name: 'Child 1' } as ArgoNodeStatus,
        'child-2': { id: 'child-2', name: 'Child 2' } as ArgoNodeStatus,
      };

      const result = buildNodeHierarchy(nodes, 'root');
      expect(result?.id).toBe('root');
      expect(result?.children).toEqual(['child-1', 'child-2']);
    });

    it('should filter out non-existent children', () => {
      const nodes = {
        'root': {
          id: 'root',
          name: 'Root',
          children: ['child-1', 'non-existent', 'child-2']
        } as ArgoNodeStatus,
        'child-1': { id: 'child-1', name: 'Child 1' } as ArgoNodeStatus,
        'child-2': { id: 'child-2', name: 'Child 2' } as ArgoNodeStatus,
      };

      const result = buildNodeHierarchy(nodes, 'root');
      expect(result?.children).toEqual(['child-1', 'child-2']);
    });
  });
});

