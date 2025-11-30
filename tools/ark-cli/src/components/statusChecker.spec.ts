import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockCommands = {
  checkCommandExists: jest.fn(),
};
jest.unstable_mockModule('../lib/commands.js', () => mockCommands);

const mockArkServices = {
  arkServices: {
    'test-service': {
      enabled: true,
      name: 'Test Service',
      helmReleaseName: 'test-release',
      k8sDeploymentName: 'test-deployment',
      namespace: 'test-ns',
    },
  },
};
jest.unstable_mockModule('../arkServices.js', () => mockArkServices);

const mockArkStatus = {
  isArkReady: jest.fn(),
};
jest.unstable_mockModule('../lib/arkStatus.js', () => mockArkStatus);

const {StatusChecker} = await import('./statusChecker.js');

describe('StatusChecker', () => {
  let checker: any;

  beforeEach(() => {
    jest.clearAllMocks();
    checker = new StatusChecker();
  });

  describe('checkDependencies', () => {
    it('should check all dependencies', async () => {
      (mockCommands.checkCommandExists as any).mockResolvedValue(true);
      (mockCommands.checkCommandExists as any).mockResolvedValue(true);
      mockExeca
        .mockResolvedValueOnce({stdout: 'v20.0.0'}) // node
        .mockResolvedValueOnce({stdout: '10.0.0'}) // npm
        .mockResolvedValueOnce({ // kubectl
          stdout: JSON.stringify({
            clientVersion: {major: '1', minor: '29'},
          }),
        })
        .mockResolvedValueOnce({stdout: '24.0.0'}) // docker
        .mockResolvedValueOnce({stdout: 'v3.14.0'}) // helm
        .mockResolvedValueOnce({stdout: 'v1.29.0'}); // microk8s

      const results = await checker.checkDependencies();
      expect(results).toHaveLength(6); // node, npm, kubectl, docker, helm, microk8s
      expect(results[0].installed).toBe(true);
    });
  });

  describe('checkDeploymentStatus', () => {
    it('should return healthy status for ready deployment', async () => {
      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({
          spec: {replicas: 1},
          status: {
            readyReplicas: 1,
            availableReplicas: 1,
            conditions: [{type: 'Available', status: 'True'}],
          },
        }),
      });

      const status = await checker.checkDeploymentStatus(
        'test',
        'dep',
        'ns'
      );
      expect(status.status).toBe('healthy');
    });

    it('should return not ready status for 0 replicas', async () => {
      mockExeca.mockResolvedValue({
        stdout: JSON.stringify({
          spec: {replicas: 0},
          status: {readyReplicas: 0},
        }),
      });

      const status = await checker.checkDeploymentStatus(
        'test',
        'dep',
        'ns'
      );
      expect(status.status).toBe('not ready');
    });

    it('should fallback to dev deployment if main not found', async () => {
      mockExeca
        .mockRejectedValueOnce(new Error('NotFound')) // Main dep not found
        .mockResolvedValueOnce({ // Dev dep found
          stdout: JSON.stringify({
            spec: {replicas: 1},
            status: {
              readyReplicas: 1,
              availableReplicas: 1,
              conditions: [{type: 'Available', status: 'True'}],
            },
          }),
        });

      const status = await checker.checkDeploymentStatus(
        'test',
        'dep',
        'ns',
        'dev-dep'
      );
      expect(status.status).toBe('healthy');
      expect(status.isDev).toBe(true);
    });

    it('should return not installed if both deployments missing', async () => {
      mockExeca.mockRejectedValue(new Error('NotFound'));

      const status = await checker.checkDeploymentStatus(
        'test',
        'dep',
        'ns',
        'dev-dep'
      );
      expect(status.status).toBe('not installed');
    });
  });

  describe('checkCombinedStatus', () => {
    it('should include helm version info for healthy deployment', async () => {
      // Mock deployment check
      mockExeca.mockResolvedValueOnce({
        stdout: JSON.stringify({
          spec: {replicas: 1},
          status: {
            readyReplicas: 1,
            availableReplicas: 1,
            conditions: [{type: 'Available', status: 'True'}],
          },
        }),
      });

      // Mock helm list
      mockExeca.mockResolvedValueOnce({
        stdout: JSON.stringify([
          {name: 'test-release', app_version: '1.0.0', revision: '1'},
        ]),
      });

      const status = await checker.checkCombinedStatus(
        'test',
        'dep',
        'test-release',
        'ns'
      );
      expect(status.version).toBe('1.0.0');
      expect(status.revision).toBe('1');
    });
  });
});
