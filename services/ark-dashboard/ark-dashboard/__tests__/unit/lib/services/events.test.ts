import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { eventsService } from '@/lib/services/events';

vi.mock('@/lib/api/client');

const apiEvent = {
  name: 'agent-created',
  namespace: 'default',
  type: 'Normal',
  reason: 'Created',
  message: 'Agent created successfully',
  source_component: 'ark-controller',
  source_host: 'node-1',
  involved_object_kind: 'Agent',
  involved_object_name: 'sample-agent',
  involved_object_namespace: 'default',
  involved_object_uid: 'involved-uid-1',
  first_timestamp: '2025-01-01T00:00:00Z',
  last_timestamp: '2025-01-01T00:05:00Z',
  count: 3,
  creation_timestamp: '2025-01-01T00:00:00Z',
  uid: 'uid-1',
};

function mockGet<T>(value: T) {
  return vi.spyOn(apiClient, 'get').mockResolvedValue(value);
}

describe('eventsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAll', () => {
    it('defaults to page 1 when called without filters', async () => {
      const get = mockGet({ items: [], total: 0 });

      await eventsService.getAll('default');

      expect(get).toHaveBeenCalledWith('/api/v1/events?page=1', {
        params: { namespace: 'default' },
      });
    });

    it('builds the query string from all supported filters', async () => {
      const get = mockGet({ items: [], total: 0 });

      await eventsService.getAll('default', {
        type: 'Warning',
        kind: 'Agent',
        name: 'sample-agent',
        limit: 25,
        page: 2,
      });

      expect(get).toHaveBeenCalledWith(
        '/api/v1/events?type=Warning&kind=Agent&name=sample-agent&limit=25&page=2',
        { params: { namespace: 'default' } },
      );
    });

    it('maps the snake_case API response onto the Event interface', async () => {
      mockGet({ items: [apiEvent], total: 1 });

      const result = await eventsService.getAll('default');

      expect(result).toEqual({
        items: [
          {
            id: 'uid-1',
            name: 'agent-created',
            namespace: 'default',
            type: 'Normal',
            reason: 'Created',
            message: 'Agent created successfully',
            sourceComponent: 'ark-controller',
            sourceHost: 'node-1',
            involvedObjectKind: 'Agent',
            involvedObjectName: 'sample-agent',
            involvedObjectNamespace: 'default',
            involvedObjectUid: 'involved-uid-1',
            firstTimestamp: '2025-01-01T00:00:00Z',
            lastTimestamp: '2025-01-01T00:05:00Z',
            count: 3,
            creationTimestamp: '2025-01-01T00:00:00Z',
            uid: 'uid-1',
          },
        ],
        total: 1,
      });
    });

    it('falls back to defaults for missing optional fields', async () => {
      mockGet({ items: [{ name: 'partial' }], total: 1 });

      const [event] = (await eventsService.getAll('default')).items;

      expect(event).toMatchObject({
        id: 'partial',
        uid: '',
        namespace: '',
        type: '',
        count: 0,
        sourceComponent: undefined,
        involvedObjectKind: '',
      });
    });

    it('returns an empty result when the response has no items', async () => {
      mockGet(null);

      await expect(eventsService.getAll('default')).resolves.toEqual({
        items: [],
        total: 0,
      });
    });

    it('derives the total from the page size when the API omits it', async () => {
      mockGet({ items: [apiEvent, apiEvent] });

      const result = await eventsService.getAll('default', { limit: 2, page: 3 });

      expect(result.total).toBe(6);
    });

    it('falls back to the item count when there is no pagination context', async () => {
      mockGet({ items: [apiEvent] });

      const result = await eventsService.getAll('default', { limit: 10 });

      expect(result.total).toBe(1);
    });

    it('propagates API failures instead of swallowing them', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network down'));

      await expect(eventsService.getAll('default')).rejects.toThrow('Network down');
    });
  });

  describe('get', () => {
    it('fetches a single event by name and maps it', async () => {
      const get = mockGet(apiEvent);

      const result = await eventsService.get('default', 'agent-created');

      expect(get).toHaveBeenCalledWith('/api/v1/events/agent-created', {
        params: { namespace: 'default' },
      });
      expect(result.involvedObjectName).toBe('sample-agent');
    });

    it('rethrows when the request fails', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Not found'));

      await expect(eventsService.get('default', 'missing')).rejects.toThrow('Not found');
    });
  });

  describe('getAllFilterOptions', () => {
    it('returns sorted, de-duplicated filter values', async () => {
      mockGet({
        items: [
          apiEvent,
          {
            ...apiEvent,
            type: 'Warning',
            involved_object_kind: 'Query',
            involved_object_name: 'a-query',
          },
          { ...apiEvent, type: '' },
        ],
        total: 3,
      });

      await expect(eventsService.getAllFilterOptions('default')).resolves.toEqual({
        types: ['Normal', 'Warning'],
        kinds: ['Agent', 'Query'],
        names: ['a-query', 'sample-agent'],
      });
    });

    it('requests a large page so filters cover more events', async () => {
      const get = mockGet({ items: [], total: 0 });

      await eventsService.getAllFilterOptions('default');

      expect(get).toHaveBeenCalledWith('/api/v1/events?limit=200&page=1', {
        params: { namespace: 'default' },
      });
    });

    it('returns empty options when the underlying fetch fails', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network down'));

      await expect(eventsService.getAllFilterOptions('default')).resolves.toEqual({
        types: [],
        kinds: [],
        names: [],
      });
    });
  });
});
