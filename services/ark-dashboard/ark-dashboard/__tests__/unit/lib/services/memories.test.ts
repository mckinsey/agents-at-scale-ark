import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { fetchAllPages } from '@/lib/api/pagination';
import {
  memoriesService,
  type MemoryDetailResponse,
} from '@/lib/services/memories';

vi.mock('@/lib/api/client');
vi.mock('@/lib/api/pagination', () => ({
  fetchAllPages: vi.fn(),
}));

const NAMESPACE = 'test-namespace';

const DETAIL: MemoryDetailResponse = {
  name: 'session-memory',
  namespace: NAMESPACE,
};

const notFound = () =>
  Object.assign(new Error('Not found'), { response: { status: 404 } });

describe('memoriesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('scopes the paginated list to the namespace without per-item detail fetches', async () => {
      vi.mocked(fetchAllPages).mockResolvedValue([{ name: 'session-memory' }]);
      const get = vi.spyOn(apiClient, 'get');

      const result = await memoriesService.getAll(NAMESPACE);

      expect(fetchAllPages).toHaveBeenCalledWith('/api/v1/memories', {
        namespace: NAMESPACE,
      });
      expect(get).not.toHaveBeenCalled();
      expect(result).toEqual([{ name: 'session-memory', id: 'session-memory' }]);
    });
  });

  describe('getByName', () => {
    it('requests the memory in the namespace and adds an id', async () => {
      const get = vi.spyOn(apiClient, 'get').mockResolvedValue(DETAIL);

      const result = await memoriesService.getByName(
        NAMESPACE,
        'session-memory',
      );

      expect(get).toHaveBeenCalledWith('/api/v1/memories/session-memory', {
        params: { namespace: NAMESPACE },
      });
      expect(result).toEqual({ ...DETAIL, id: 'session-memory' });
    });

    it('returns null on 404', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(notFound());

      await expect(
        memoriesService.getByName(NAMESPACE, 'missing'),
      ).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Boom'));

      await expect(
        memoriesService.getByName(NAMESPACE, 'session-memory'),
      ).rejects.toThrow('Boom');
    });
  });

  describe('getById', () => {
    it('coerces a numeric id to a name and delegates', async () => {
      const get = vi.spyOn(apiClient, 'get').mockResolvedValue(DETAIL);

      await memoriesService.getById(NAMESPACE, 7);

      expect(get).toHaveBeenCalledWith('/api/v1/memories/7', {
        params: { namespace: NAMESPACE },
      });
    });
  });

  describe('create', () => {
    it('posts into the namespace and adds an id', async () => {
      const post = vi.spyOn(apiClient, 'post').mockResolvedValue(DETAIL);
      const request = { name: 'session-memory' };

      const result = await memoriesService.create(NAMESPACE, request);

      expect(post).toHaveBeenCalledWith('/api/v1/memories', request, {
        params: { namespace: NAMESPACE },
      });
      expect(result).toEqual({ ...DETAIL, id: 'session-memory' });
    });
  });

  describe('update', () => {
    it('puts into the namespace and adds an id', async () => {
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(DETAIL);

      const result = await memoriesService.update(
        NAMESPACE,
        'session-memory',
        { description: 'updated' },
      );

      expect(put).toHaveBeenCalledWith(
        '/api/v1/memories/session-memory',
        { description: 'updated' },
        { params: { namespace: NAMESPACE } },
      );
      expect(result).toEqual({ ...DETAIL, id: 'session-memory' });
    });

    it('returns null on 404', async () => {
      vi.spyOn(apiClient, 'put').mockRejectedValue(notFound());

      await expect(
        memoriesService.update(NAMESPACE, 'missing', {}),
      ).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
      vi.spyOn(apiClient, 'put').mockRejectedValue(new Error('Boom'));

      await expect(
        memoriesService.update(NAMESPACE, 'session-memory', {}),
      ).rejects.toThrow('Boom');
    });
  });

  describe('updateById', () => {
    it('coerces a numeric id to a name and delegates', async () => {
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(DETAIL);

      await memoriesService.updateById(NAMESPACE, 7, {});

      expect(put).toHaveBeenCalledWith(
        '/api/v1/memories/7',
        {},
        { params: { namespace: NAMESPACE } },
      );
    });
  });

  describe('delete', () => {
    it('deletes in the namespace and reports success', async () => {
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(undefined);

      await expect(
        memoriesService.delete(NAMESPACE, 'session-memory'),
      ).resolves.toBe(true);
      expect(del).toHaveBeenCalledWith('/api/v1/memories/session-memory', {
        params: { namespace: NAMESPACE },
      });
    });

    it('returns false on 404', async () => {
      vi.spyOn(apiClient, 'delete').mockRejectedValue(notFound());

      await expect(
        memoriesService.delete(NAMESPACE, 'missing'),
      ).resolves.toBe(false);
    });

    it('rethrows any other failure', async () => {
      vi.spyOn(apiClient, 'delete').mockRejectedValue(new Error('Boom'));

      await expect(
        memoriesService.delete(NAMESPACE, 'session-memory'),
      ).rejects.toThrow('Boom');
    });
  });

  describe('deleteById', () => {
    it('coerces a numeric id to a name and delegates', async () => {
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(undefined);

      await memoriesService.deleteById(NAMESPACE, 7);

      expect(del).toHaveBeenCalledWith('/api/v1/memories/7', {
        params: { namespace: NAMESPACE },
      });
    });
  });
});
