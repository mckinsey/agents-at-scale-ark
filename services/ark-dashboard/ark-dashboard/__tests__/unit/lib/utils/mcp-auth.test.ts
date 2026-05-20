import { describe, it, expect } from 'vitest';
import {
  getAuthorizationInfo,
  formatAuthorizedAt,
} from '@/lib/utils/mcp-auth';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServer } from '@/lib/services/mcp-servers';

describe('mcp-auth utilities', () => {
  describe('getAuthorizationInfo', () => {
    it('should return Authorized when both authorized-by and authorized-at annotations are present', () => {
      const mcpServer: MCPServer = {
        id: 'test-id',
        name: 'test-server',
        namespace: 'default',
        available: 'True',
        annotations: {
          [ARK_ANNOTATIONS.AUTHORIZED_BY]: 'user@example.com',
          [ARK_ANNOTATIONS.AUTHORIZED_AT]: '2024-01-01T00:00:00Z',
        },
      };

      const result = getAuthorizationInfo(mcpServer);

      expect(result.state).toBe('Authorized');
      expect(result.authorizedBy).toBe('user@example.com');
      expect(result.authorizedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should return Required when server is unavailable and no auth annotations', () => {
      const mcpServer: MCPServer = {
        id: 'test-id',
        name: 'test-server',
        namespace: 'default',
        available: 'False',
        annotations: {},
      };

      const result = getAuthorizationInfo(mcpServer);

      expect(result.state).toBe('Required');
      expect(result.authorizedBy).toBeUndefined();
      expect(result.authorizedAt).toBeUndefined();
    });

    it('should return Unknown when server is available and no auth annotations', () => {
      const mcpServer: MCPServer = {
        id: 'test-id',
        name: 'test-server',
        namespace: 'default',
        available: 'True',
        annotations: {},
      };

      const result = getAuthorizationInfo(mcpServer);

      expect(result.state).toBe('Unknown');
    });

    it('should return Unknown when annotations are undefined', () => {
      const mcpServer: MCPServer = {
        id: 'test-id',
        name: 'test-server',
        namespace: 'default',
        available: 'True',
      };

      const result = getAuthorizationInfo(mcpServer);

      expect(result.state).toBe('Unknown');
    });

    it('should return Unknown when only authorized-by is present', () => {
      const mcpServer: MCPServer = {
        id: 'test-id',
        name: 'test-server',
        namespace: 'default',
        available: 'True',
        annotations: {
          [ARK_ANNOTATIONS.AUTHORIZED_BY]: 'user@example.com',
        },
      };

      const result = getAuthorizationInfo(mcpServer);

      expect(result.state).toBe('Unknown');
    });

    it('should return Unknown when only authorized-at is present', () => {
      const mcpServer: MCPServer = {
        id: 'test-id',
        name: 'test-server',
        namespace: 'default',
        available: 'True',
        annotations: {
          [ARK_ANNOTATIONS.AUTHORIZED_AT]: '2024-01-01T00:00:00Z',
        },
      };

      const result = getAuthorizationInfo(mcpServer);

      expect(result.state).toBe('Unknown');
    });
  });

  describe('formatAuthorizedAt', () => {
    it('should format a valid ISO string', () => {
      const isoString = '2024-01-01T12:00:00Z';
      const result = formatAuthorizedAt(isoString);

      // Just check it returns a string - locale formatting varies
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return the original string if invalid ISO format', () => {
      const invalidString = 'not-a-date';
      const result = formatAuthorizedAt(invalidString);

      expect(result).toBe(invalidString);
    });
  });
});
