import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { fetchAllPages } from '@/lib/api/pagination';
import {
  modelsService,
  type ModelDetailResponse,
} from '@/lib/services/models';

vi.mock('@/lib/api/client');
vi.mock('@/lib/api/pagination', () => ({
  fetchAllPages: vi.fn(),
}));
vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

const NAMESPACE = 'test-namespace';

const DETAIL: ModelDetailResponse = {
  name: 'gpt-4',
  namespace: NAMESPACE,
  model: 'gpt-4',
  provider: 'openai',
  type: 'completions',
  config: {},
};

const notFound = () =>
  Object.assign(new Error('Not found'), { response: { status: 404 } });

describe('modelsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('scopes the paginated list to the namespace and hydrates each item', async () => {
      vi.mocked(fetchAllPages).mockResolvedValue([{ name: 'gpt-4' }]);
      vi.spyOn(apiClient, 'get').mockResolvedValue(DETAIL);

      const result = await modelsService.getAll(NAMESPACE);

      expect(fetchAllPages).toHaveBeenCalledWith('/api/v1/models', {
        namespace: NAMESPACE,
      });
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/models/gpt-4', {
        params: { namespace: NAMESPACE },
      });
      expect(result).toEqual([{ ...DETAIL, id: 'gpt-4' }]);
    });
  });

  describe('getByName', () => {
    it('requests the model in the namespace and adds an id', async () => {
      const get = vi.spyOn(apiClient, 'get').mockResolvedValue(DETAIL);

      const result = await modelsService.getByName(NAMESPACE, 'gpt-4');

      expect(get).toHaveBeenCalledWith('/api/v1/models/gpt-4', {
        params: { namespace: NAMESPACE },
      });
      expect(result).toEqual({ ...DETAIL, id: 'gpt-4' });
    });

    it('returns null on 404', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(notFound());

      await expect(
        modelsService.getByName(NAMESPACE, 'missing'),
      ).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Boom'));

      await expect(
        modelsService.getByName(NAMESPACE, 'gpt-4'),
      ).rejects.toThrow('Boom');
    });
  });

  describe('getById', () => {
    it('coerces a numeric id to a name and delegates', async () => {
      const get = vi.spyOn(apiClient, 'get').mockResolvedValue(DETAIL);

      await modelsService.getById(NAMESPACE, 42);

      expect(get).toHaveBeenCalledWith('/api/v1/models/42', {
        params: { namespace: NAMESPACE },
      });
    });
  });

  describe('create', () => {
    it('posts into the namespace and adds an id', async () => {
      const post = vi.spyOn(apiClient, 'post').mockResolvedValue(DETAIL);
      const request = {
        name: 'gpt-4',
        model: 'gpt-4',
        provider: 'openai' as const,
        type: 'completions' as const,
        config: {},
      };

      const result = await modelsService.create(NAMESPACE, request);

      expect(post).toHaveBeenCalledWith('/api/v1/models', request, {
        params: { namespace: NAMESPACE },
      });
      expect(result).toEqual({ ...DETAIL, id: 'gpt-4' });
    });
  });

  describe('update', () => {
    it('puts into the namespace and adds an id', async () => {
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(DETAIL);

      const result = await modelsService.update(NAMESPACE, 'gpt-4', {
        model: 'gpt-4o',
      });

      expect(put).toHaveBeenCalledWith(
        '/api/v1/models/gpt-4',
        { model: 'gpt-4o' },
        { params: { namespace: NAMESPACE } },
      );
      expect(result).toEqual({ ...DETAIL, id: 'gpt-4' });
    });

    it('returns null on 404', async () => {
      vi.spyOn(apiClient, 'put').mockRejectedValue(notFound());

      await expect(
        modelsService.update(NAMESPACE, 'missing', {}),
      ).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
      vi.spyOn(apiClient, 'put').mockRejectedValue(new Error('Boom'));

      await expect(
        modelsService.update(NAMESPACE, 'gpt-4', {}),
      ).rejects.toThrow('Boom');
    });
  });

  describe('updateById', () => {
    it('coerces a numeric id to a name and delegates', async () => {
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(DETAIL);

      await modelsService.updateById(NAMESPACE, 42, {});

      expect(put).toHaveBeenCalledWith(
        '/api/v1/models/42',
        {},
        { params: { namespace: NAMESPACE } },
      );
    });
  });

  describe('delete', () => {
    it('deletes in the namespace and reports success', async () => {
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(undefined);

      await expect(modelsService.delete(NAMESPACE, 'gpt-4')).resolves.toBe(
        true,
      );
      expect(del).toHaveBeenCalledWith('/api/v1/models/gpt-4', {
        params: { namespace: NAMESPACE },
      });
    });

    it('returns false on 404', async () => {
      vi.spyOn(apiClient, 'delete').mockRejectedValue(notFound());

      await expect(modelsService.delete(NAMESPACE, 'missing')).resolves.toBe(
        false,
      );
    });

    it('rethrows any other failure', async () => {
      vi.spyOn(apiClient, 'delete').mockRejectedValue(new Error('Boom'));

      await expect(modelsService.delete(NAMESPACE, 'gpt-4')).rejects.toThrow(
        'Boom',
      );
    });
  });

  describe('deleteById', () => {
    it('coerces a numeric id to a name and delegates', async () => {
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(undefined);

      await modelsService.deleteById(NAMESPACE, 42);

      expect(del).toHaveBeenCalledWith('/api/v1/models/42', {
        params: { namespace: NAMESPACE },
      });
    });
  });
});
