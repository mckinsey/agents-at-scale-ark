import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockWriteFile = jest.fn() as any;
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
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

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const {createExportCommand} = await import('./index.js');
import type {ArkConfig} from '../../lib/config.js';

describe('export command', () => {
  const mockConfig: ArkConfig = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create export command with correct description', () => {
    const command = createExportCommand(mockConfig);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('export');
    expect(command.description()).toBe('export ARK resources to a file');
  });

  it('should export all resource types by default', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: []}),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync(['node', 'test', '-o', 'test.yaml']);

    const expectedResourceTypes = [
      'secrets',
      'tools',
      'models',
      'agents',
      'teams',
      'evaluators',
      'mcpservers',
      'a2aservers',
    ];

    expect(mockExeca).toHaveBeenCalledTimes(expectedResourceTypes.length);

    for (const resourceType of expectedResourceTypes) {
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['get', resourceType, '-o', 'yaml']),
        expect.any(Object)
      );
    }
  });

  it('should filter by resource types when specified and export in order', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: []}),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'agents,models',
      '-o',
      'test.yaml',
    ]);

    expect(mockExeca.mock.calls).toEqual([
      ['kubectl', expect.arrayContaining(['get', 'models']), expect.any(Object)],
      ['kubectl', expect.arrayContaining(['get', 'agents']), expect.any(Object)],
    ]);
  });

  it('should use namespace filter when specified', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: []}),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-n',
      'custom-namespace',
      '-t',
      'agents',
      '-o',
      'test.yaml',
    ]);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      expect.arrayContaining(['-n', 'custom-namespace']),
      expect.any(Object)
    );
  });

  it('should use label selector when specified', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: []}),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-l',
      'app=test',
      '-t',
      'agents',
      '-o',
      'test.yaml',
    ]);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      expect.arrayContaining(['-l', 'app=test']),
      expect.any(Object)
    );
  });
});
