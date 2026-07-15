import {vi} from 'vitest';
import {Command} from 'commander';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockWriteFile = vi.fn() as any;
const mockMkdir = vi.fn() as any;
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

const mockOutput = {
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({
  default: mockOutput,
}));

const {createOkfCommand} = await import('./index.js');
import type {ArkConfig} from '../../lib/config.js';

function kubectlList(items: unknown[]) {
  return {
    stdout: JSON.stringify({
      apiVersion: 'v1',
      kind: 'List',
      items,
      metadata: {resourceVersion: ''},
    }),
  };
}

const agent = {
  metadata: {
    name: 'researcher',
    namespace: 'default',
    creationTimestamp: '2026-07-01T00:00:00Z',
  },
  spec: {
    description: 'Researches topics.',
    prompt: 'You are a researcher.',
    modelRef: {name: 'gpt4'},
    tools: [{type: 'mcp', name: 'github-search'}],
  },
};

const model = {
  metadata: {name: 'gpt4', namespace: 'default'},
  spec: {type: 'openai', model: {value: 'gpt-4o'}},
};

const team = {
  metadata: {name: 'crew', namespace: 'default'},
  spec: {
    strategy: 'sequential',
    members: [{name: 'researcher', type: 'agent'}],
  },
};

const mcpServer = {
  metadata: {name: 'github', namespace: 'default'},
  spec: {transport: 'http', description: 'GitHub MCP server.'},
  status: {resolvedAddress: 'http://github-mcp.default.svc/mcp'},
};

const tool = {
  metadata: {name: 'github-search', namespace: 'default'},
  spec: {mcp: {mcpServerRef: {name: 'github'}, toolName: 'search'}},
};

describe('okf command', () => {
  const mockConfig: ArkConfig = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create okf command with export subcommand', () => {
    const command = createOkfCommand(mockConfig);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('okf');
    expect(command.commands.map((c) => c.name())).toContain('export');
  });

  it('should export cluster resources as an OKF bundle', async () => {
    // listResources is called once per resource type, in Promise.all order:
    // agents, models, teams, mcpservers, tools.
    mockExeca
      .mockResolvedValueOnce(kubectlList([agent]))
      .mockResolvedValueOnce(kubectlList([model]))
      .mockResolvedValueOnce(kubectlList([team]))
      .mockResolvedValueOnce(kubectlList([mcpServer]))
      .mockResolvedValueOnce(kubectlList([tool]));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    const command = createOkfCommand(mockConfig);
    await command.parseAsync(['node', 'ark', 'export', '-o', '/tmp/bundle']);

    const written = new Map<string, string>(
      mockWriteFile.mock.calls.map((call: string[]) => [call[0], call[1]])
    );

    expect([...written.keys()].sort()).toEqual([
      '/tmp/bundle/agents/researcher.md',
      '/tmp/bundle/index.md',
      '/tmp/bundle/log.md',
      '/tmp/bundle/mcpservers/github.md',
      '/tmp/bundle/models/gpt4.md',
      '/tmp/bundle/teams/crew.md',
    ]);

    const agentDoc = written.get('/tmp/bundle/agents/researcher.md')!;
    expect(agentDoc).toContain('type: Ark Agent');
    expect(agentDoc).toContain('description: Researches topics.');
    expect(agentDoc).toContain('[gpt4](../models/gpt4.md)');
    expect(agentDoc).toContain('[github](../mcpservers/github.md)');

    const indexDoc = written.get('/tmp/bundle/index.md')!;
    expect(indexDoc).toContain('okf_version: "0.1"');
    expect(indexDoc).toContain('[researcher](agents/researcher.md)');

    const serverDoc = written.get('/tmp/bundle/mcpservers/github.md')!;
    expect(serverDoc).toContain('type: Ark MCP Server');
    expect(serverDoc).toContain('github-search');

    expect(mockOutput.success).toHaveBeenCalledWith(
      expect.stringContaining('exported 4 concepts')
    );
  });

  it('should warn when no resources are found', async () => {
    mockExeca.mockResolvedValue(kubectlList([]));

    const command = createOkfCommand(mockConfig);
    await command.parseAsync(['node', 'ark', 'export']);

    expect(mockOutput.warning).toHaveBeenCalledWith(
      'no resources found to export'
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
