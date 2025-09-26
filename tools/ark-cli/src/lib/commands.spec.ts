import {describe, it, expect, jest, beforeEach} from '@jest/globals';

// Mock chalk to avoid ANSI codes in tests
jest.unstable_mockModule('chalk', () => ({
  default: {
    gray: (str: string) => str,
  },
}));

// Mock execa using unstable_mockModule
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

// Dynamic imports after mock
const {execa} = await import('execa');
const {checkCommandExists, execute} = await import('./commands.js');

// Type the mock properly
const mockExeca = execa as any;

describe('commands', () => {
  describe('checkCommandExists', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns true when command executes successfully', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'v1.0.0',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('helm', ['version']);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('helm', ['version']);
    });

    it('returns false when command fails', async () => {
      mockExeca.mockRejectedValue(new Error('Command not found'));

      const result = await checkCommandExists('nonexistent', ['--version']);

      expect(result).toBe(false);
      expect(mockExeca).toHaveBeenCalledWith('nonexistent', ['--version']);
    });

    it('uses default --version arg when no args provided', async () => {
      mockExeca.mockResolvedValue({
        stdout: '1.0.0',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('node');

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('node', ['--version']);
    });

    it('uses custom args when provided', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'Client Version: v1.28.0',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('kubectl', [
        'version',
        '--client',
      ]);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('kubectl', [
        'version',
        '--client',
      ]);
    });

    it('handles empty args array', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('echo', []);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('echo', []);
    });
  });

  describe('execute', () => {
    let mockConsoleLog: jest.SpiedFunction<typeof console.log>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockConsoleLog.mockRestore();
    });

    it('executes command without verbose output by default', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
      });

      await execute('helm', ['install', 'test'], {stdio: 'inherit' as const});

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockExeca).toHaveBeenCalledWith('helm', ['install', 'test'], {
        stdio: 'inherit',
      });
    });

    it('prints command when verbose is true', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
      });

      await execute(
        'helm',
        ['install', 'test'],
        {stdio: 'inherit' as const},
        {verbose: true}
      );

      expect(mockConsoleLog).toHaveBeenCalledWith('$ helm install test');
      expect(mockExeca).toHaveBeenCalledWith('helm', ['install', 'test'], {
        stdio: 'inherit',
      });
    });

    it('works with empty args array', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await execute('ls', [], {}, {verbose: true});

      expect(mockConsoleLog).toHaveBeenCalledWith('$ ls ');
      expect(mockExeca).toHaveBeenCalledWith('ls', [], {});
    });

    it('passes through execa options correctly', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const execaOpts = {stdio: 'pipe' as const, timeout: 5000, cwd: '/tmp'};
      await execute('kubectl', ['get', 'pods'], execaOpts);

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        ['get', 'pods'],
        execaOpts
      );
    });

    it('handles command failure', async () => {
      const error = new Error('Command failed');
      mockExeca.mockRejectedValue(error);

      await expect(execute('fail', ['now'])).rejects.toThrow('Command failed');
      expect(mockExeca).toHaveBeenCalledWith('fail', ['now'], {});
    });

    it('defaults to no verbose when additionalOptions not provided', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
      });

      await execute('echo', ['test']);

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockExeca).toHaveBeenCalledWith('echo', ['test'], {});
    });
  });
});
