import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockOutput = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}));

const {createRoutesCommand, runCommand} = await import('./index.js');

describe('routes command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runCommand', () => {
    it('should show command and output by default', async () => {
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'command output',
        stderr: '',
      });

      await runCommand(['get', 'pods']);

      expect(mockOutput.info).toHaveBeenCalledWith('Running: kubectl get pods');
      expect(mockConsoleLog).toHaveBeenCalledWith('command output');
    });

    it('should hide command and output when requested', async () => {
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'command output',
        stderr: '',
      });

      await runCommand(['get', 'pods'], {showOutput: false, showCommand: false});

      expect(mockOutput.info).not.toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  it('should list ingress routes', async () => {
    // Mock ingress check
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'ingress-output',
      stderr: '',
    });

    // Mock httproutes check
    mockExeca.mockResolvedValueOnce({
      stdout: 'default route1 [host1.com]',
    });

    const command = createRoutesCommand({});
    await command.parseAsync(['node', 'ark', 'routes']);

    expect(mockOutput.success).toHaveBeenCalledWith('Ingress routes found:');
    expect(mockConsoleLog).toHaveBeenCalledWith('ingress-output');
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('available localhost gateway routes: 1'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('route1'));
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('http://host1.com/'));
  });

  it('should handle no routes found', async () => {
    // Mock ingress check (none)
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    // Mock httproutes check (none)
    mockExeca.mockResolvedValueOnce({
      stdout: '',
    });

    const command = createRoutesCommand({});
    await command.parseAsync(['node', 'ark', 'routes']);

    expect(mockOutput.warning).toHaveBeenCalledWith('No Ingress routes found.');
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('available localhost gateway routes: 0'));
    expect(mockOutput.info).toHaveBeenCalledWith('no httproutes found. install services to see routes here.');
  });

  it('should handle errors', async () => {
    // Mock ingress check success
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    // Mock httproutes check failure
    mockExeca.mockRejectedValueOnce(new Error('kubectl failed'));

    const command = createRoutesCommand({});
    await expect(command.parseAsync(['node', 'ark', 'routes'])).rejects.toThrow('process.exit called');

    expect(mockOutput.error).toHaveBeenCalledWith(
      'failed to fetch routes:',
      expect.stringContaining('kubectl failed')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
  it('should handle stderr output', async () => {
    // Mock ingress check with stderr
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: 'some warning',
    });

    // Mock httproutes check
    mockExeca.mockResolvedValueOnce({
      stdout: '',
    });

    const command = createRoutesCommand({});
    await command.parseAsync(['node', 'ark', 'routes']);

    expect(mockOutput.error).toHaveBeenCalledWith('some warning');
  });

  it('should handle runCommand failure (ingress check)', async () => {
    // Mock ingress check failure
    mockExeca.mockRejectedValueOnce(new Error('kubectl ingress failed'));

    // Mock httproutes check (should still run)
    mockExeca.mockResolvedValueOnce({
      stdout: '',
    });

    const command = createRoutesCommand({});
    await command.parseAsync(['node', 'ark', 'routes']);

    expect(mockOutput.error).toHaveBeenCalledWith(
      'Command failed: kubectl get ingress -A --no-headers'
    );
    expect(mockOutput.error).toHaveBeenCalledWith('kubectl ingress failed');
    // Should continue to httproutes even if ingress check fails
    expect(mockOutput.info).toHaveBeenCalledWith(
      'no httproutes found. install services to see routes here.'
    );
  });

  it('should filter out invalid or empty hostnames', async () => {
    // Mock ingress check
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    // Mock httproutes check with various edge cases
    mockExeca.mockResolvedValueOnce({
      stdout: `
namespace1 route1 [valid.com]
namespace2 route2 [<none>]
namespace3 route3 []
namespace4 route4
      `.trim(),
    });

    const command = createRoutesCommand({});
    await command.parseAsync(['node', 'ark', 'routes']);

    // Should only show valid.com
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('available localhost gateway routes: 1')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('route1'));
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('http://valid.com/')
    );
    
    // Should not show others
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('route2'));
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('route3'));
    expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('route4'));
  });
});
