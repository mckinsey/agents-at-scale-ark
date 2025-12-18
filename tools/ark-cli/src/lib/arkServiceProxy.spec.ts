import {jest} from '@jest/globals';
import {Buffer} from 'buffer';
import type {ArkService} from '../types/arkService.js';

type MockFn = ReturnType<typeof jest.fn>;

const mockFind = jest.fn() as MockFn;

jest.unstable_mockModule('find-process', () => ({
  default: mockFind,
}));

const mockSpawn = jest.fn() as MockFn;
const mockChildProcess = {
  spawn: mockSpawn,
};

jest.unstable_mockModule('child_process', () => ({
  ...mockChildProcess,
  spawn: mockSpawn,
}));

const {ArkServiceProxy} = await import('./arkServiceProxy.js');

describe('ArkServiceProxy', () => {
  const mockService: ArkService = {
    name: 'test-service',
    helmReleaseName: 'test-service',
    description: 'Test service',
    k8sServiceName: 'test-service-k8s',
    k8sServicePort: 8080,
    namespace: 'default',
    enabled: true,
    category: 'test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('port-forward reuse', () => {
    it('creates new port-forward when reuse is disabled', async () => {
      const proxy = new ArkServiceProxy(mockService, 3000, false);

      const mockProcess = {
        stdout: {on: jest.fn() as MockFn},
        stderr: {on: jest.fn() as MockFn},
        on: jest.fn() as MockFn,
        kill: jest.fn() as MockFn,
      };

      mockSpawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          (call: any) => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Forwarding from 127.0.0.1:3000'));
        }
      }, 10);

      const url = await proxy.start();

      expect(url).toBe('http://localhost:3000');
      expect(mockFind).not.toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledWith(
        'kubectl',
        ['port-forward', 'service/test-service-k8s', '3000:8080', '--namespace', 'default'],
        expect.any(Object)
      );
    });

    it('reuses existing kubectl port-forward when reuse is enabled', async () => {
      mockFind.mockResolvedValue([
        {
          pid: 12345,
          name: 'kubectl',
          cmd: 'kubectl port-forward service/test-service-k8s 3000:8080',
        },
      ]);

      const proxy = new ArkServiceProxy(mockService, 3000, true);
      const url = await proxy.start();

      expect(url).toBe('http://localhost:3000');
      expect(mockFind).toHaveBeenCalledWith('port', 3000);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('creates new port-forward when port is not in use', async () => {
      mockFind.mockResolvedValue([]);

      const proxy = new ArkServiceProxy(mockService, 3000, true);

      const mockProcess = {
        stdout: {on: jest.fn() as MockFn},
        stderr: {on: jest.fn() as MockFn},
        on: jest.fn() as MockFn,
        kill: jest.fn() as MockFn,
      };

      mockSpawn.mockReturnValue(mockProcess);

      setTimeout(() => {
        const stdoutCallback = mockProcess.stdout.on.mock.calls.find(
          (call: any) => call[0] === 'data'
        )?.[1];
        if (stdoutCallback) {
          stdoutCallback(Buffer.from('Forwarding from 127.0.0.1:3000'));
        }
      }, 10);

      const url = await proxy.start();

      expect(url).toBe('http://localhost:3000');
      expect(mockFind).toHaveBeenCalledWith('port', 3000);
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('throws error when port is in use by non-kubectl process', async () => {
      mockFind.mockResolvedValue([
        {
          pid: 54321,
          name: 'node',
          cmd: 'node server.js',
        },
      ]);

      const proxy = new ArkServiceProxy(mockService, 3000, true);

      await expect(proxy.start()).rejects.toThrow(
        'test-service port forward failed: port 3000 is already in use by node (PID: 54321)'
      );

      expect(mockFind).toHaveBeenCalledWith('port', 3000);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });
});
