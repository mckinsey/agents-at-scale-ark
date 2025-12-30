import { beforeEach, describe, expect, it, vi } from 'vitest';

global.fetch = vi.fn();

describe('flows service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('checkArgoAvailable', () => {
    it('returns true when Argo API responds with OK', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const { checkArgoAvailable } = await import('@/lib/services/flows');
      const result = await checkArgoAvailable();

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        '/api/argo/workflow-templates?namespace=default',
      );
    });

    it('returns false when Argo API responds with error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const { checkArgoAvailable } = await import('@/lib/services/flows');
      const result = await checkArgoAvailable();

      expect(result).toBe(false);
    });

    it('returns false when fetch throws an error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const { checkArgoAvailable } = await import('@/lib/services/flows');
      const result = await checkArgoAvailable();

      expect(result).toBe(false);
    });
  });

  describe('getArgoBaseUrl', () => {
    it('returns baseUrl from API config', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ baseUrl: 'http://argo.example.com:2746' }),
      } as Response);

      const { getArgoBaseUrl } = await import('@/lib/services/flows');
      const result = await getArgoBaseUrl();

      expect(result).toBe('http://argo.example.com:2746');
    });

    it('returns default URL when API fails', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const { getArgoBaseUrl } = await import('@/lib/services/flows');
      const result = await getArgoBaseUrl();

      expect(result).toBe('http://localhost:2746');
    });
  });

  describe('workflowTemplatesService', () => {
    it('getAll returns templates from API', async () => {
      const mockTemplates = [
        { name: 'template1', namespace: 'default', parameters: [] },
      ];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplates,
      } as Response);

      const { workflowTemplatesService } = await import('@/lib/services/flows');
      const result = await workflowTemplatesService.getAll('default');

      expect(result).toEqual(mockTemplates);
      expect(fetch).toHaveBeenCalledWith(
        '/api/argo/workflow-templates?namespace=default',
      );
    });

    it('getAll returns empty array when API fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const { workflowTemplatesService } = await import('@/lib/services/flows');
      const result = await workflowTemplatesService.getAll('default');

      expect(result).toEqual([]);
    });

    it('getByName returns template when found', async () => {
      const mockTemplate = {
        name: 'my-template',
        namespace: 'default',
        parameters: [],
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTemplate,
      } as Response);

      const { workflowTemplatesService } = await import('@/lib/services/flows');
      const result = await workflowTemplatesService.getByName(
        'my-template',
        'default',
      );

      expect(result).toEqual(mockTemplate);
    });

    it('getByName returns null when not found', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const { workflowTemplatesService } = await import('@/lib/services/flows');
      const result = await workflowTemplatesService.getByName(
        'non-existent',
        'default',
      );

      expect(result).toBeNull();
    });
  });
});
