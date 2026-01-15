import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const {getResource, listResources, deleteResource} = await import(
  './kubectl.js'
);

interface TestResource {
  metadata: {
    name: string;
    creationTimestamp: string;
  };
  spec?: {
    value: string;
  };
}

describe('kubectl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getResource', () => {
    it('should get a specific resource by name', async () => {
      const mockResource: TestResource = {
        metadata: {
          name: 'test-query',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        spec: {
          value: 'test',
        },
      };

      mockExeca.mockResolvedValue({
        stdout: JSON.stringify(mockResource),
      });

      const result = await getResource<TestResource>('queries', 'test-query');

      expect(result).toEqual(mockResource);
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'queries', 'test-query', '-o', 'json'],
        {stdio: 'pipe'}
      );
    });

    it('should get latest resource when name is @latest', async () => {
      const mockResources: TestResource[] = [
        {
          metadata: {
            name: 'query-1',
            creationTimestamp: '2024-01-01T00:00:00Z',
          },
        },
        {
          metadata: {
            name: 'query-2',
            creationTimestamp: '2024-01-02T00:00:00Z',
          },
        },
        {
          metadata: {
            name: 'query-3',
            creationTimestamp: '2024-01-03T00:00:00Z',
          },
        },
      ];

      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({items: mockResources}),
      });

      const result = await getResource<TestResource>('queries', '@latest');

      expect(result).toEqual(mockResources[2]);
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        [
          'get',
          'queries',
          '--sort-by=.metadata.creationTimestamp',
          '-o',
          'json',
        ],
        {stdio: 'pipe'}
      );
    });

    it('should throw error when @latest finds no resources', async () => {
      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({items: []}),
      });

      await expect(
        getResource<TestResource>('queries', '@latest')
      ).rejects.toThrow('No queries found');
    });

    it('should handle kubectl errors', async () => {
      mockExeca.mockRejectedValue(new Error('kubectl error'));

      await expect(
        getResource<TestResource>('queries', 'test-query')
      ).rejects.toThrow('kubectl error');
    });

    it('should work with different resource types', async () => {
      const mockAgent: TestResource = {
        metadata: {
          name: 'test-agent',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
      };

      mockExeca.mockResolvedValue({
        stdout: JSON.stringify(mockAgent),
      });

      const result = await getResource<TestResource>('agents', 'test-agent');

      expect(result).toEqual(mockAgent);
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'agents', 'test-agent', '-o', 'json'],
        {stdio: 'pipe'}
      );
    });
  });

  describe('listResources', () => {
    it('should list all resources of a given type', async () => {
      const mockResources: TestResource[] = [
        {
          metadata: {
            name: 'query-1',
            creationTimestamp: '2024-01-01T00:00:00Z',
          },
          spec: {
            value: 'test1',
          },
        },
        {
          metadata: {
            name: 'query-2',
            creationTimestamp: '2024-01-02T00:00:00Z',
          },
          spec: {
            value: 'test2',
          },
        },
      ];

      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({items: mockResources}),
      });

      const result = await listResources<TestResource>('queries');

      expect(result).toEqual(mockResources);
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'queries', '-o', 'json'],
        {stdio: 'pipe'}
      );
    });

    it('should return an empty array when no resources exist', async () => {
      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({items: []}),
      });

      const result = await listResources<TestResource>('queries');

      expect(result).toEqual([]);
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'queries', '-o', 'json'],
        {stdio: 'pipe'}
      );
    });

    it('should list resources with custom sort option', async () => {
      const mockResources: TestResource[] = [
        {
          metadata: {
            name: 'query-1',
            creationTimestamp: '2024-01-01T00:00:00Z',
          },
        },
        {
          metadata: {
            name: 'query-2',
            creationTimestamp: '2024-01-02T00:00:00Z',
          },
        },
      ];

      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({items: mockResources}),
      });

      const result = await listResources<TestResource>('queries', {
        sortBy: '.metadata.creationTimestamp',
      });

      expect(result).toEqual(mockResources);
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        [
          'get',
          'queries',
          '--sort-by=.metadata.creationTimestamp',
          '-o',
          'json',
        ],
        {stdio: 'pipe'}
      );
    });

    it('should pass namespace and label filters', async () => {
      const result = await listResources<TestResource>('queries', {
        labels: 'app=test',
        namespace: 'foo'
      });

      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        [
          'get',
          'queries',
          '-n',
          'foo',
          '-l',
          'app=test',
          '-o',
          'json',
        ],
        {stdio: 'pipe'}
      );
    });

    it('should handle kubectl errors when listing resources', async () => {
      mockExeca.mockRejectedValue(new Error('kubectl connection error'));

      await expect(listResources<TestResource>('queries')).rejects.toThrow(
        'kubectl connection error'
      );
    });
  });

  describe('deleteResource', () => {
    it('should delete a resource by name', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
      });

      await deleteResource('queries', 'test-query');

      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['delete', 'queries', 'test-query'],
        {stdio: 'pipe'}
      );
    });

    it('should delete all resources of a type when all option is true', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
      });

      await deleteResource('queries', undefined, {all: true});

      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['delete', 'queries', '--all'],
        {stdio: 'pipe'}
      );
    });
  });
});
