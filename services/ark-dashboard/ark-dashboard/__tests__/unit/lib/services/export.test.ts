import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { exportService } from '@/lib/services/export';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

// Mock dependencies
vi.mock('@/lib/api/client');
vi.mock('@/lib/services/workflow-templates');

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window functions
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

describe('exportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCreateObjectURL.mockReturnValue('blob:http://example.com/123');
  });

  describe('Core functionality', () => {
    it('should fetch all resources successfully', async () => {
      // Mock responses for each resource type
      vi.mocked(apiClient.get).mockImplementation((url) => {
        const responses: Record<string, any> = {
          '/api/v1/agents': Promise.resolve({
            items: [{ name: 'agent-1' }, { name: 'agent-2' }],
          }),
          '/api/v1/teams': Promise.resolve({
            items: [{ name: 'team-1' }],
          }),
          '/api/v1/models': Promise.resolve({
            items: [{ name: 'model-1' }],
          }),
        };
        return responses[url] || Promise.resolve({ items: [] });
      });

      vi.mocked(workflowTemplatesService.list).mockResolvedValueOnce([
        { metadata: { name: 'workflow-1' } },
      ] as any);

      const result = await exportService.fetchAllResources();

      expect(result.agents).toHaveLength(2);
      expect(result.teams).toHaveLength(1);
      expect(result.models).toHaveLength(1);
      expect(result.workflows).toHaveLength(1);
    });

    it('should export selected resources', async () => {
      const selectedItems = {
        agents: [
          { id: 'agent-1', name: 'agent-1', type: 'agent', selected: true },
          { id: 'agent-2', name: 'agent-2', type: 'agent', selected: false },
        ],
        teams: [
          { id: 'team-1', name: 'team-1', type: 'team', selected: true },
        ],
      };

      const mockBlob = new Blob(['test data']);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Mock DOM elements
      const mockLink = document.createElement('a');
      const clickSpy = vi.spyOn(mockLink, 'click').mockImplementation(() => {});
      const removeSpy = vi.spyOn(mockLink, 'remove').mockImplementation(() => {});

      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink);

      await exportService.exportResources(selectedItems);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/export/resources'),
        expect.objectContaining({
          body: JSON.stringify({
            resource_types: ['agents', 'teams'],
            resource_ids: {
              agents: ['agent-1'],
              teams: ['team-1'],
            },
          }),
        })
      );

      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('should handle export errors gracefully', async () => {
      const selectedItems = {
        agents: [{ id: 'agent-1', name: 'agent-1', type: 'agent', selected: true }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(exportService.exportResources(selectedItems)).rejects.toThrow(
        'Export failed: Internal Server Error'
      );
    });

    it('should reject empty resource selection', async () => {
      const selectedItems = {
        agents: [{ id: 'agent-1', name: 'agent-1', type: 'agent', selected: false }],
      };

      await expect(exportService.exportResources(selectedItems)).rejects.toThrow(
        'No resources selected for export'
      );
    });

    it('should get last export time from backend', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        last_export: '2024-01-15T12:00:00Z',
        export_count: 5,
      });

      const result = await exportService.getLastExportTime();
      expect(result).toBe('2024-01-15T12:00:00Z');
    });
  });
});