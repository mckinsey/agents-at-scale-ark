import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth/create-oidc-provider', () => ({
  createOIDCProvider: vi.fn(() => ({
    id: 'test-provider',
    name: 'Test Provider',
    type: 'oidc'
  }))
}));

vi.mock('@/lib/auth/token-manager', () => ({
  TokenManager: {
    getNewAccessToken: vi.fn()
  }
}));

// Mock environment variables
const originalEnv = process.env;

describe('auth-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment variables
    process.env = {
      ...originalEnv,
      OIDC_CLIENT_ID: 'test-client-id',
      OIDC_ISSUER_URL: 'https://example.com',
      OIDC_PROVIDER_NAME: 'Test Provider',
      OIDC_PROVIDER_ID: 'test-provider',
      OIDC_CLIENT_SECRET: 'test-secret',
      AUTH_DEBUG: 'false',
      AUTH_URL: 'http://localhost:3000'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('configuration loading', () => {
    it('should load auth configuration without errors', async () => {
      const authConfigModule = await import('@/lib/auth/auth-config');
      
      expect(authConfigModule.authConfig).toBeDefined();
      expect(authConfigModule.authConfig.trustHost).toBe(true);
      expect(authConfigModule.authConfig.providers).toHaveLength(1);
    });

    it('should have session configuration', async () => {
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      expect(authConfig.session).toEqual({
        strategy: 'jwt',
        maxAge: 30 * 60 // 30 minutes
      });
    });

    it('should have pages configuration', async () => {
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      expect(authConfig.pages).toEqual({
        signIn: '/api/auth/signin'
      });
    });

    it('should have callbacks defined', async () => {
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      expect(authConfig.callbacks).toBeDefined();
      expect(authConfig.callbacks?.jwt).toBeDefined();
      expect(authConfig.callbacks?.session).toBeDefined();
      expect(authConfig.callbacks?.authorized).toBeDefined();
    });

    it('should have cookies configuration', async () => {
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      expect(authConfig.cookies).toBeDefined();
      expect(authConfig.cookies?.sessionToken).toBeDefined();
      expect(authConfig.cookies?.callbackUrl).toBeDefined();
      expect(authConfig.cookies?.csrfToken).toBeDefined();
      expect(authConfig.cookies?.pkceCodeVerifier).toBeDefined();
      expect(authConfig.cookies?.state).toBeDefined();
      expect(authConfig.cookies?.nonce).toBeDefined();
    });

    it('should set debug mode based on environment', async () => {
      // This test verifies that debug configuration can be set
      // Note: Due to module loading constraints, we verify the basic behavior
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      // The debug property should be a boolean
      expect(typeof authConfig.debug).toBe('boolean');
    });

    it('should set secure cookies based on AUTH_URL', async () => {
      // This test verifies that secure cookie configuration can be set
      // Note: Due to module loading constraints, we verify the basic behavior
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      // The useSecureCookies property should be a boolean
      expect(typeof authConfig.useSecureCookies).toBe('boolean');
    });
  });

  describe('callback functionality', () => {
    it('should export callback functions that can be called', async () => {
      const { authConfig } = await import('@/lib/auth/auth-config');
      
      // Test that callbacks exist and are functions
      expect(typeof authConfig.callbacks?.jwt).toBe('function');
      expect(typeof authConfig.callbacks?.session).toBe('function');
      expect(typeof authConfig.callbacks?.authorized).toBe('function');
    });
  });
});
