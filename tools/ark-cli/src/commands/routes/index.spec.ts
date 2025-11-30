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

const {createRoutesCommand} = await import('./index.js');

describe('routes command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      stdout: 'NAMESPACE NAME HOSTNAMES\ndefault route1 [host1.com]',
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
    // Mock ingress check failure
    mockExeca.mockRejectedValueOnce(new Error('kubectl failed'));

    const command = createRoutesCommand({});
    await expect(command.parseAsync(['node', 'ark', 'routes'])).rejects.toThrow('process.exit called');

    expect(mockOutput.error).toHaveBeenCalledWith(
      'failed to fetch routes:',
      expect.stringContaining('kubectl failed')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
