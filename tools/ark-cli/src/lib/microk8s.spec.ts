import {jest} from '@jest/globals';
import path from 'path';
import os from 'os';

const mockExecute = jest.fn();
const mockCheckCommandExists = jest.fn();
jest.unstable_mockModule('./commands.js', () => ({
  execute: mockExecute,
  checkCommandExists: mockCheckCommandExists,
  isCommandAvailable: mockCheckCommandExists,
}));

const mockFs = {
  mkdir: jest.fn(),
  access: jest.fn(),
  writeFile: jest.fn(),
  chmod: jest.fn(),
  copyFile: jest.fn(),
};
jest.unstable_mockModule('fs/promises', () => ({
  default: mockFs,
}));

jest.unstable_mockModule('ora', () => ({
  default: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn(),
    fail: jest.fn(),
    text: '',
  }),
}));

const {configureMicroK8s, isMicroK8sInstalled} = await import('./microk8s.js');
const commands = await import('./commands.js');

describe('microk8s', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isMicroK8sInstalled', () => {
    it('returns true if microk8s status command exists', async () => {
      (mockCheckCommandExists as any).mockResolvedValue(true);
      const result = await isMicroK8sInstalled();
      expect(result).toBe(true);
      expect(mockCheckCommandExists).toHaveBeenCalledWith('microk8s', [
        'status',
      ]);
    });

    it('returns false if microk8s status command fails', async () => {
      (mockCheckCommandExists as any).mockResolvedValue(false);
      const result = await isMicroK8sInstalled();
      expect(result).toBe(false);
    });
  });

  describe('configureMicroK8s', () => {
    it('configures microk8s successfully', async () => {
      (mockExecute as any).mockResolvedValue({
        stdout: 'kubeconfig-content',
      });
      (mockFs.mkdir as any).mockResolvedValue(undefined);
      (mockFs.access as any).mockRejectedValue(new Error('File not found')); // Simulate no existing config
      (mockFs.writeFile as any).mockResolvedValue(undefined);
      (mockFs.chmod as any).mockResolvedValue(undefined);

      await configureMicroK8s();

      expect(mockExecute).toHaveBeenCalledWith(
        'microk8s',
        ['status', '--wait-ready'],
        {},
        {verbose: false}
      );
      expect(mockExecute).toHaveBeenCalledWith(
        'microk8s',
        ['enable', 'dns', 'helm', 'ingress', 'registry', 'hostpath-storage', 'metrics-server'],
        {},
        {verbose: false}
      );
      expect(mockExecute).toHaveBeenCalledWith(
        'microk8s',
        ['config'],
        {},
        {verbose: false}
      );

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(os.homedir(), '.kube', 'config'),
        'kubeconfig-content'
      );
    });

    it('backs up existing kubeconfig', async () => {
      (mockExecute as any).mockResolvedValue({
        stdout: 'kubeconfig-content',
      });
      (mockFs.mkdir as any).mockResolvedValue(undefined);
      (mockFs.access as any).mockResolvedValue(undefined); // Simulate existing config
      (mockFs.copyFile as any).mockResolvedValue(undefined);
      (mockFs.writeFile as any).mockResolvedValue(undefined);
      (mockFs.chmod as any).mockResolvedValue(undefined);

      await configureMicroK8s();

      expect(mockFs.copyFile).toHaveBeenCalled();
    });

    it('throws error if configuration fails', async () => {
      (mockExecute as any).mockRejectedValue(new Error('Command failed'));

      await expect(configureMicroK8s()).rejects.toThrow('Command failed');
    });
  });
  it('throws error if kubeconfig is not a string', async () => {
    (mockExecute as any).mockResolvedValueOnce({}); // status
    (mockExecute as any).mockResolvedValueOnce({}); // enable
    (mockExecute as any).mockResolvedValueOnce({stdout: 123}); // config (invalid type)

    await expect(configureMicroK8s()).rejects.toThrow('Failed to retrieve kubeconfig');
  });
});
