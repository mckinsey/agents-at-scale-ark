import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';

// ESM-safe mocking: declare variables to hold dynamically imported modules
let createMemoryCommand: any;
let deleteSession: any;
let deleteQuery: any;
let deleteAll: any;
let ArkApiProxy: any;
let output: any;

// Mock dependencies
vi.mock('../../lib/output.js', () => ({
  default: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ArkApiProxy with a simpler approach
vi.mock('../../lib/arkApiProxy.js', () => ({
  __esModule: true,
  ArkApiProxy: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

beforeAll(async () => {
  // After mocks are registered, dynamically import modules
  ({ArkApiProxy} = await import('../../lib/arkApiProxy.js'));
  ({default: output} = await import('../../lib/output.js'));
  ({createMemoryCommand, deleteSession, deleteQuery, deleteAll} = await import(
    './index.js'
  ));
});

describe('Memory Command', () => {
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Structure', () => {
    it('should create memory command with correct structure', () => {
      const command = createMemoryCommand(mockConfig);

      expect(command.name()).toBe('memory');
      expect(command.alias()).toBe('mem');
      expect(command.description()).toBe('Manage memory sessions and queries');
    });

    it('should have list subcommand', () => {
      const command = createMemoryCommand(mockConfig);
      const subcommands = (command as any).commands.map((cmd: any) =>
        cmd.name()
      );

      expect(subcommands).toContain('list');
    });

    it('should have delete subcommand with nested commands and flags', () => {
      const command = createMemoryCommand(mockConfig);
      const deleteCommand = (command as any).commands.find(
        (cmd: any) => cmd.name() === 'delete'
      );

      expect(deleteCommand).toBeDefined();
      expect(deleteCommand?.description()).toBe('Delete memory data');

      const deleteSubcommands =
        deleteCommand?.commands.map((cmd: any) => cmd.name()) || [];
      expect(deleteSubcommands).toContain('session');
      expect(deleteSubcommands).toContain('query');
      // --all flag is supported on the delete root instead of an 'all' subcommand
    });
  });

  describe('Command Creation', () => {
    it('should create command without errors', () => {
      expect(() => createMemoryCommand(mockConfig)).not.toThrow();
    });

    it('should return a command object', () => {
      const command = createMemoryCommand(mockConfig);
      expect(command).toBeDefined();
      expect(typeof command.name).toBe('function');
      expect(typeof command.description).toBe('function');
    });
  });

  describe('Error Scenarios', () => {
    let exitSpy: any;

    beforeEach(async () => {
      exitSpy = vi
        .spyOn(process as any, 'exit')
        .mockImplementation(
          ((..._args: unknown[]) => undefined) as unknown as any
        );
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('deleteSession handles 500 error', async () => {
      const err = new Error('Internal Server Error');
      const fakeClient = {
        deleteSession: (vi.fn() as any).mockRejectedValue(err),
      } as any;
      (ArkApiProxy as unknown as vi.Mock).mockImplementation(() => ({
        start: (vi.fn() as any).mockResolvedValue(fakeClient),
        stop: vi.fn(),
      }));

      await deleteSession('sess-1', {output: 'text'}).catch(() => {});

      expect(output.error).toHaveBeenCalled();
      expect(process.exit as unknown as vi.Mock).toHaveBeenCalledWith(1);
    });

    it('deleteQuery handles network timeout', async () => {
      const err = new Error('Network timeout');
      const fakeClient = {
        deleteQueryMessages: (vi.fn() as any).mockRejectedValue(err),
      } as any;
      (ArkApiProxy as unknown as vi.Mock).mockImplementation(() => ({
        start: (vi.fn() as any).mockResolvedValue(fakeClient),
        stop: vi.fn(),
      }));

      await deleteQuery('sess-2', 'query-9', {output: 'text'}).catch(() => {});

      expect(output.error).toHaveBeenCalled();
      expect(process.exit as unknown as vi.Mock).toHaveBeenCalledWith(1);
    });

    it('deleteAll handles no memory services reachable', async () => {
      const err = new Error('No memory services reachable');
      const fakeClient = {
        deleteAllSessions: (vi.fn() as any).mockRejectedValue(err),
      } as any;
      (ArkApiProxy as unknown as vi.Mock).mockImplementation(() => ({
        start: (vi.fn() as any).mockResolvedValue(fakeClient),
        stop: vi.fn(),
      }));

      await deleteAll({output: 'text'}).catch(() => {});

      expect(output.error).toHaveBeenCalled();
      expect(process.exit as unknown as vi.Mock).toHaveBeenCalledWith(1);
    });
  });
});
