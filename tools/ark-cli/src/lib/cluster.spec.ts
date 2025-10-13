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
    it('detects minikube cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'minikube'});
      const result = await detectClusterType();
      expect(result).toEqual({type: 'minikube', context: 'minikube'});
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'config',
        'current-context',
      ]);
    });

    it('detects kind cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'kind-kind'});
      const result = await detectClusterType();
      expect(result).toEqual({type: 'kind', context: 'kind-kind'});
    });

    it('detects k3s cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'k3s-default'});
      const result = await detectClusterType();
      expect(result).toEqual({type: 'k3s', context: 'k3s-default'});
    });

    it('detects docker-desktop cluster', async () => {
      mockExeca.mockResolvedValue({stdout: 'docker-desktop'});
      const result = await detectClusterType();
      expect(result).toEqual({
        type: 'docker-desktop',
        context: 'docker-desktop',
      });
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
      'current-context': 'minikube',
      contexts: [
        {
          name: 'minikube',
          context: {
            namespace: 'default',
          },
        },
      ],
    };

    it('gets minikube cluster info with IP', async () => {
      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(mockConfig)})
        .mockResolvedValueOnce({stdout: 'minikube'})
        .mockResolvedValueOnce({stdout: '192.168.49.2'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'minikube',
        context: 'minikube',
        namespace: 'default',
        ip: '192.168.49.2',
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
      expect(mockExeca).toHaveBeenCalledWith('minikube', ['ip']);
    });

    it('falls back to kubectl for minikube IP if minikube command fails', async () => {
      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(mockConfig)})
        .mockResolvedValueOnce({stdout: 'minikube'})
        .mockRejectedValueOnce(new Error('minikube not found'))
        .mockResolvedValueOnce({stdout: '192.168.49.2'});

      const result = await getClusterInfo();

      expect(result.ip).toBe('192.168.49.2');
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'get',
        'nodes',
        '-o',
        'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}',
      ]);
    });

    it('gets kind cluster info with IP', async () => {
      const kindConfig = {
        'current-context': 'kind-kind',
        contexts: [
          {
            name: 'kind-kind',
            context: {
              namespace: 'kube-system',
            },
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(kindConfig)})
        .mockResolvedValueOnce({stdout: 'kind-kind'})
        .mockResolvedValueOnce({stdout: '172.18.0.2'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'kind',
        context: 'kind-kind',
        namespace: 'kube-system',
        ip: '172.18.0.2',
      });
    });

    it('gets docker-desktop cluster info', async () => {
      const dockerConfig = {
        'current-context': 'docker-desktop',
        contexts: [
          {
            name: 'docker-desktop',
            context: {},
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(dockerConfig)})
        .mockResolvedValueOnce({stdout: 'docker-desktop'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'docker-desktop',
        context: 'docker-desktop',
        namespace: 'default',
        ip: 'localhost',
      });
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

    it('gets k3s cluster info', async () => {
      const k3sConfig = {
        'current-context': 'k3s-default',
        contexts: [
          {
            name: 'k3s-default',
            context: {},
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(k3sConfig)})
        .mockResolvedValueOnce({stdout: 'k3s-default'})
        .mockResolvedValueOnce({stdout: '10.0.0.5'});

      const result = await getClusterInfo();

      expect(result).toEqual({
        type: 'k3s',
        context: 'k3s-default',
        namespace: 'default',
        ip: '10.0.0.5',
      });
    });

    it('uses provided context parameter', async () => {
      const multiConfig = {
        'current-context': 'kind-staging',
        contexts: [
          {
            name: 'kind-staging',
            context: {
              namespace: 'staging-ns',
            },
          },
        ],
      };

      mockExeca
        .mockResolvedValueOnce({stdout: JSON.stringify(multiConfig)})
        .mockResolvedValueOnce({stdout: 'kind-staging'})
        .mockResolvedValueOnce({stdout: '172.18.0.3'});

      const result = await getClusterInfo('kind-staging');

      expect(result.context).toBe('kind-staging');
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'config',
        'view',
        '--minify',
        '-o',
        'json',
        '--context',
        'kind-staging',
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
