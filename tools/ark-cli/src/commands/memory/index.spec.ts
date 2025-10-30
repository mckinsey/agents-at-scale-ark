import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createMemoryCommand, deleteSession, deleteQuery, deleteAll } from './index.js';
import { ArkApiProxy } from '../../lib/arkApiProxy.js';
import output from '../../lib/output.js';

// Mock dependencies
jest.mock('../../lib/output.js', () => ({
  default: {
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock ArkApiProxy with a simpler approach
jest.mock('../../lib/arkApiProxy.js', () => {
  return {
    __esModule: true,
    ArkApiProxy: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
    })),
  };
});

describe('Memory Command', () => {
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {};
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      const subcommands = command.commands.map(cmd => cmd.name());
      
      expect(subcommands).toContain('list');
    });

    it('should have delete subcommand with nested commands and flags', () => {
      const command = createMemoryCommand(mockConfig);
      const deleteCommand = command.commands.find(cmd => cmd.name() === 'delete');
      
      expect(deleteCommand).toBeDefined();
      expect(deleteCommand?.description()).toBe('Delete memory data');
      
      const deleteSubcommands = deleteCommand?.commands.map(cmd => cmd.name()) || [];
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
      exitSpy = jest
        .spyOn(process as any, 'exit')
        .mockImplementation((((..._args: unknown[]) => undefined) as unknown) as any);
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('deleteSession handles 500 error', async () => {
      const err = new Error('Internal Server Error');
      const fakeClient = { deleteSession: (jest.fn() as any).mockRejectedValue(err) } as any;
      (ArkApiProxy as unknown as jest.Mock).mockImplementation(() => ({
        start: (jest.fn() as any).mockResolvedValue(fakeClient),
        stop: jest.fn(),
      }));

      await deleteSession('sess-1', { output: 'text' }).catch(() => {});

      expect(output.error).toHaveBeenCalled();
      expect((process.exit as unknown as jest.Mock)).toHaveBeenCalledWith(1);
    });

    it('deleteQuery handles network timeout', async () => {
      const err = new Error('Network timeout');
      const fakeClient = { deleteQueryMessages: (jest.fn() as any).mockRejectedValue(err) } as any;
      (ArkApiProxy as unknown as jest.Mock).mockImplementation(() => ({
        start: (jest.fn() as any).mockResolvedValue(fakeClient),
        stop: jest.fn(),
      }));

      await deleteQuery('sess-2', 'query-9', { output: 'text' }).catch(() => {});

      expect(output.error).toHaveBeenCalled();
      expect((process.exit as unknown as jest.Mock)).toHaveBeenCalledWith(1);
    });

    it('deleteAll handles no memory services reachable', async () => {
      const err = new Error('No memory services reachable');
      const fakeClient = { deleteAllSessions: (jest.fn() as any).mockRejectedValue(err) } as any;
      (ArkApiProxy as unknown as jest.Mock).mockImplementation(() => ({
        start: (jest.fn() as any).mockResolvedValue(fakeClient),
        stop: jest.fn(),
      }));

      await deleteAll({ output: 'text' }).catch(() => {});

      expect(output.error).toHaveBeenCalled();
      expect((process.exit as unknown as jest.Mock)).toHaveBeenCalledWith(1);
    });
  });
});