/**
 * @jest-environment node
 */
import { GET } from '../route';

jest.mock('@kubernetes/client-node');

const mockCoreApi = {
  listNamespace: jest.fn(),
};

const mockCustomApi = {
  listClusterCustomObject: jest.fn(),
};

const mockKubeConfig = {
  loadFromDefault: jest.fn(),
  makeApiClient: jest.fn((api: any) => {
    if (api.name === 'CoreV1Api') return mockCoreApi;
    if (api.name === 'CustomObjectsApi') return mockCustomApi;
    return {};
  }),
};

describe('GET /api/demos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const k8s = require('@kubernetes/client-node');
    k8s.KubeConfig = jest.fn(() => mockKubeConfig);
    k8s.CoreV1Api = { name: 'CoreV1Api' };
    k8s.CustomObjectsApi = { name: 'CustomObjectsApi' };
  });

  it('returns available demos with HTTPRoutes', async () => {
    mockCoreApi.listNamespace.mockResolvedValue({
      body: {
        items: [
          {
            metadata: {
              name: 'demo1',
              labels: { 'ark.mckinsey.com/demo': 'true' },
              annotations: {
                'ark.mckinsey.com/demo-name': 'Demo 1',
                'ark.mckinsey.com/demo-description': 'Description 1',
              },
            },
          },
          {
            metadata: {
              name: 'demo2',
              labels: { 'ark.mckinsey.com/demo': 'true' },
              annotations: {
                'ark.mckinsey.com/demo-name': 'Demo 2',
                'ark.mckinsey.com/demo-description': 'Description 2',
              },
            },
          },
        ],
      },
    });

    mockCustomApi.listClusterCustomObject.mockResolvedValue({
      body: {
        items: [
          { metadata: { namespace: 'demo1' } },
          { metadata: { namespace: 'demo2' } },
        ],
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual([
      {
        name: 'demo1',
        displayName: 'Demo 1',
        description: 'Description 1',
      },
      {
        name: 'demo2',
        displayName: 'Demo 2',
        description: 'Description 2',
      },
    ]);
  });

  it('filters out demos without HTTPRoutes', async () => {
    mockCoreApi.listNamespace.mockResolvedValue({
      body: {
        items: [
          {
            metadata: {
              name: 'demo1',
              labels: { 'ark.mckinsey.com/demo': 'true' },
            },
          },
          {
            metadata: {
              name: 'demo2',
              labels: { 'ark.mckinsey.com/demo': 'true' },
            },
          },
        ],
      },
    });

    mockCustomApi.listClusterCustomObject.mockResolvedValue({
      body: {
        items: [
          { metadata: { namespace: 'demo1' } },
        ],
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('demo1');
  });

  it('returns error when Kubernetes API fails', async () => {
    mockCoreApi.listNamespace.mockRejectedValue(new Error('K8s API error'));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ error: 'Failed to fetch demos' });
  });

  it('sorts demos by display name', async () => {
    mockCoreApi.listNamespace.mockResolvedValue({
      body: {
        items: [
          {
            metadata: {
              name: 'demo2',
              labels: { 'ark.mckinsey.com/demo': 'true' },
              annotations: { 'ark.mckinsey.com/demo-name': 'Zebra Demo' },
            },
          },
          {
            metadata: {
              name: 'demo1',
              labels: { 'ark.mckinsey.com/demo': 'true' },
              annotations: { 'ark.mckinsey.com/demo-name': 'Apple Demo' },
            },
          },
        ],
      },
    });

    mockCustomApi.listClusterCustomObject.mockResolvedValue({
      body: {
        items: [
          { metadata: { namespace: 'demo1' } },
          { metadata: { namespace: 'demo2' } },
        ],
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(data[0].displayName).toBe('Apple Demo');
    expect(data[1].displayName).toBe('Zebra Demo');
  });
});
