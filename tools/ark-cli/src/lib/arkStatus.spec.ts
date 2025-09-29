import {describe, it, expect, jest, beforeEach} from '@jest/globals';

// Mock execa using unstable_mockModule
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

// Dynamic imports after mock
const {execa} = await import('execa');
const {isArkReady} = await import('./arkStatus.js');

describe('arkStatus with __mocks__', () => {
  describe('isArkReady', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return true when ark-controller is deployed and ready', async () => {
      // Mock successful kubectl response with ready deployment
      const mockDeployment = {
        metadata: {name: 'ark-controller'},
        spec: {replicas: 3},
        status: {
          readyReplicas: 3,
          availableReplicas: 3,
        },
      };

      (execa as any).mockResolvedValue({
        stdout: JSON.stringify(mockDeployment),
        stderr: '',
        exitCode: 0,
        failed: false,
      });

      const result = await isArkReady();

      expect(result).toBe(true);
      expect(execa).toHaveBeenCalledWith(
        'kubectl',
        [
          'get',
          'deployment',
          'ark-controller',
          '-n',
          'ark-system',
          '-o',
          'json',
        ],
        {stdio: 'pipe'}
      );
    });

    it('should return false when kubectl fails', async () => {
      // Mock kubectl failure
      (execa as any).mockRejectedValue(new Error('kubectl not found'));

      const result = await isArkReady();

      expect(result).toBe(false);
    });
  });
});
