import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createMemoryCommand } from './index.js';

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
});