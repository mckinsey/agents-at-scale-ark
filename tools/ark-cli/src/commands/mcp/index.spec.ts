import {vi} from 'vitest';

const mockRunLogin = vi.fn();
const mockRunLogout = vi.fn();

vi.mock('./login.js', () => ({runLogin: mockRunLogin}));
vi.mock('./logout.js', () => ({runLogout: mockRunLogout}));

const {createMcpCommand} = await import('./index.js');
import type {ArkConfig} from '../../lib/config.js';

const baseConfig: ArkConfig = {} as ArkConfig;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createMcpCommand structure', () => {
  it('registers an "mcp" command with an "auth" subcommand', () => {
    const mcp = createMcpCommand(baseConfig);
    expect(mcp.name()).toBe('mcp');
    expect(mcp.description()).toBe('manage MCP servers');

    const auth = mcp.commands.find((c) => c.name() === 'auth');
    expect(auth).toBeDefined();
    expect(auth!.description()).toBe('manage MCP server authorization');
  });

  it('auth has login and logout subcommands', () => {
    const mcp = createMcpCommand(baseConfig);
    const auth = mcp.commands.find((c) => c.name() === 'auth')!;
    const names = auth.commands.map((c) => c.name()).sort();
    expect(names).toEqual(['login', 'logout']);
  });

  it('login command declares the documented options', () => {
    const mcp = createMcpCommand(baseConfig);
    const auth = mcp.commands.find((c) => c.name() === 'auth')!;
    const login = auth.commands.find((c) => c.name() === 'login')!;
    const flags = login.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining([
        '--namespace',
        '--force',
        '--no-open',
        '--timeout',
        '--scope',
      ])
    );
  });

  it('logout command declares the documented options', () => {
    const mcp = createMcpCommand(baseConfig);
    const auth = mcp.commands.find((c) => c.name() === 'auth')!;
    const logout = auth.commands.find((c) => c.name() === 'logout')!;
    const flags = logout.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining([
        '--namespace',
        '--keep-client',
        '--delete-secret',
      ])
    );
  });
});

describe('createMcpCommand wiring', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('mcp auth login forwards mapped options to runLogin and exits with its code', async () => {
    mockRunLogin.mockResolvedValue(0);
    const mcp = createMcpCommand(baseConfig);
    await mcp.parseAsync(
      [
        'auth',
        'login',
        'notion-mcp',
        '--namespace',
        'team-a',
        '--force',
        '--no-open',
        '--timeout',
        '60s',
        '--scope',
        'read write',
      ],
      {from: 'user'}
    );

    expect(mockRunLogin).toHaveBeenCalledTimes(1);
    expect(mockRunLogin).toHaveBeenCalledWith('notion-mcp', {
      namespace: 'team-a',
      force: true,
      open: false,
      timeout: '60s',
      scope: 'read write',
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('mcp auth login propagates non-zero exit code', async () => {
    mockRunLogin.mockResolvedValue(1);
    const mcp = createMcpCommand(baseConfig);
    await mcp.parseAsync(['auth', 'login', 'notion-mcp'], {
      from: 'user',
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('mcp auth logout forwards mapped options to runLogout and exits with its code', async () => {
    mockRunLogout.mockResolvedValue(0);
    const mcp = createMcpCommand(baseConfig);
    await mcp.parseAsync(
      [
        'auth',
        'logout',
        'notion-mcp',
        '--namespace',
        'team-a',
        '--keep-client',
      ],
      {from: 'user'}
    );

    expect(mockRunLogout).toHaveBeenCalledTimes(1);
    expect(mockRunLogout).toHaveBeenCalledWith('notion-mcp', {
      namespace: 'team-a',
      keepClient: true,
      deleteSecret: undefined,
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('mcp auth logout with --delete-secret', async () => {
    mockRunLogout.mockResolvedValue(0);
    const mcp = createMcpCommand(baseConfig);
    await mcp.parseAsync(
      ['auth', 'logout', 'notion-mcp', '--delete-secret'],
      {from: 'user'}
    );
    expect(mockRunLogout).toHaveBeenCalledWith('notion-mcp', {
      namespace: undefined,
      keepClient: undefined,
      deleteSecret: true,
    });
  });

  it('mcp auth logout propagates non-zero exit code', async () => {
    mockRunLogout.mockResolvedValue(1);
    const mcp = createMcpCommand(baseConfig);
    await mcp.parseAsync(['auth', 'logout', 'notion-mcp'], {
      from: 'user',
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
