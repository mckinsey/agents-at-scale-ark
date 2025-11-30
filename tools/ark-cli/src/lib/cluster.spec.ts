import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const {getClusterInfo, detectClusterType} = await import('./cluster.js');

describe('cluster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectClusterType', () => {
    it('detects microk8s cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'microk8s'});
      const result = await detectClusterType();
      expect(result).toEqual({type: 'microk8s', context: 'microk8s'});
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'config',
        'current-context',
      ]);
    });

    it('detects gke cloud cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'gke_project_zone_cluster'});
      const result = await detectClusterType();
      expect(result).toEqual({
        type: 'cloud',
        context: 'gke_project_zone_cluster',
      });
    });

    it('detects eks cloud cluster', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'arn:aws:eks:region:account:cluster/name',
      });
      const result = await detectClusterType();
      expect(result).toEqual({
        type: 'cloud',
        context: 'arn:aws:eks:region:account:cluster/name',
      });
    });

    it('detects aks cloud cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'aks-cluster-name'});
      const result = await detectClusterType();
      expect(result).toEqual({type: 'cloud', context: 'aks-cluster-name'});
    });

    it('returns unknown for unrecognized cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'some-other-cluster'});
      const result = await detectClusterType();
      expect(result).toEqual({type: 'unknown', context: 'some-other-cluster'});
    });

    it('handles kubectl error', async () => {
      mockExeca.mockRejectedValue(new Error('kubectl not found'));
      const result = await detectClusterType();
      expect(result).toEqual({type: 'unknown', error: 'kubectl not found'});
    });
  });

  describe('getClusterInfo', () => {
    const mockConfig = {
      'current-context': 'microk8s',
      contexts: [
        {
          name: 'microk8s',
          context: {
            namespace: 'default',
          },
        },
      ],
    };

    it('gets microk8s cluster info with IP', async () => {
      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(mockConfig)})
        .mockResolvedValueOnce({stdout: 'microk8s'})
        .mockResolvedValueOnce({stdout: '192.168.1.10'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'microk8s',
        context: 'microk8s',
        namespace: 'default',
        ip: '192.168.1.10',
      });

      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'config',
        'view',
        '--minify',
        '-o',
        'json',
      ]);
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'config',
        'current-context',
      ]);
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'get',
        'nodes',
        '-o',
        'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}',
      ]);
    });

    it('gets cloud cluster info with load balancer IP', async () => {
      const cloudConfig = {
        'current-context': 'gke_project_zone_cluster',
        contexts: [
          {
            name: 'gke_project_zone_cluster',
            context: {
              namespace: 'production',
            },
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(cloudConfig)})
        .mockResolvedValueOnce({stdout: 'gke_project_zone_cluster'})
        .mockResolvedValueOnce({stdout: '35.201.125.17'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'cloud',
        context: 'gke_project_zone_cluster',
        namespace: 'production',
        ip: '35.201.125.17',
      });

      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'get',
        'svc',
        '-n',
        'istio-system',
        'istio-ingressgateway',
        '-o',
        'jsonpath={.status.loadBalancer.ingress[0].ip}',
      ]);
    });

    it('falls back to hostname for cloud cluster if no IP', async () => {
      const cloudConfig = {
        'current-context': 'eks-cluster',
        contexts: [
          {
            name: 'eks-cluster',
            context: {},
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(cloudConfig)})
        .mockResolvedValueOnce({stdout: 'eks-cluster'})
        .mockResolvedValueOnce({stdout: ''})
        .mockResolvedValueOnce({stdout: 'a1234.elb.amazonaws.com'});

      const result = await getClusterInfo();

      expect(result.ip).toBe('a1234.elb.amazonaws.com');
    });

    it('falls back to external node IP for cloud cluster', async () => {
      const cloudConfig = {
        'current-context': 'gke-cluster',
        contexts: [
          {
            name: 'gke-cluster',
            context: {},
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(cloudConfig)})
        .mockResolvedValueOnce({stdout: 'gke-cluster'})
        .mockRejectedValueOnce(new Error('service not found'))
        .mockResolvedValueOnce({stdout: '35.201.125.18'});

      const result = await getClusterInfo();

      expect(result.ip).toBe('35.201.125.18');
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'get',
        'nodes',
        '-o',
        'jsonpath={.items[0].status.addresses[?(@.type=="ExternalIP")].address}',
      ]);
    });

    it('uses provided context parameter', async () => {
      const multiConfig = {
        'current-context': 'microk8s',
        contexts: [
          {
            name: 'microk8s',
            context: {
              namespace: 'staging-ns',
            },
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(multiConfig)})
        .mockResolvedValueOnce({stdout: 'microk8s'})
        .mockResolvedValueOnce({stdout: '192.168.1.11'});

      const result = await getClusterInfo('microk8s');

      expect(result.context).toBe('microk8s');
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'config',
        'view',
        '--minify',
        '-o',
        'json',
        '--context',
        'microk8s',
      ]);
    });

    it('handles unknown cluster type', async () => {
      const unknownConfig = {
        'current-context': 'custom-cluster',
        contexts: [
          {
            name: 'custom-cluster',
            context: {},
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(unknownConfig)})
        .mockResolvedValueOnce({stdout: 'custom-cluster'})
        .mockResolvedValueOnce({stdout: '10.0.0.1'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'unknown',
        context: 'custom-cluster',
        namespace: 'default',
        ip: '10.0.0.1',
      });
    });

    it('handles kubectl config error', async () => {
      mockExeca.mockRejectedValue(new Error('kubectl not configured'));

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'unknown',
        error: 'kubectl not configured',
      });
    });

    it('handles missing context in config', async () => {
      const emptyConfig = {
        contexts: [],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(emptyConfig)})
        .mockResolvedValueOnce({stdout: ''})
        .mockResolvedValueOnce({stdout: '10.0.0.1'});

      const result = await getClusterInfo();

      expect(result.context).toBe('');
      expect(result.namespace).toBe('default');
    });
  });
});
