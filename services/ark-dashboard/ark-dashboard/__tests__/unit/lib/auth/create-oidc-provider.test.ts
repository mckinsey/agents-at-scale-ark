import { describe, it, expect, vi, afterAll } from 'vitest';
import { createOIDCProvider } from '@/lib/auth/create-oidc-provider';
import type { OktaProfile } from "@auth/core/providers/okta";

// Mock the constants
vi.mock('@/lib/constants/auth', () => ({
  OIDC_CONFIG_URL: 'https://example.com/.well-known/openid-configuration'
}));

describe('createOIDCProvider', () => {
  afterAll(() => {
    vi.clearAllMocks();
  });

  it('should create an OIDC provider with correct configuration', () => {
    const options = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      name: 'Test Provider',
      id: 'test-provider',
      issuer: 'https://example.com'
    };

    const provider = createOIDCProvider<OktaProfile>(options);

    expect(provider).toEqual({
      type: 'oidc',
      wellKnown: 'https://example.com/.well-known/openid-configuration',
      authorization: { 
        params: { 
          scope: 'openid email profile' 
        } 
      },
      checks: ['pkce', 'state'],
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      name: 'Test Provider',
      id: 'test-provider',
      issuer: 'https://example.com'
    });
  });

  it('should include all provided options in the provider configuration', () => {
    const options = {
      clientId: 'custom-client',
      name: 'Custom Provider',
      id: 'custom-provider',
      additionalParam: 'test-value'
    };

    const provider = createOIDCProvider(options);

    expect(provider.clientId).toBe('custom-client');
    expect(provider.name).toBe('Custom Provider');
    expect(provider.id).toBe('custom-provider');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((provider as any).additionalParam).toBe('test-value');
  });

  it('should always set correct OIDC type and configuration', () => {
    const provider = createOIDCProvider({
      clientId: 'test',
      name: 'test',
      id: 'test'
    });

    expect(provider.type).toBe('oidc');
    expect(provider.wellKnown).toBe('https://example.com/.well-known/openid-configuration');
    expect(provider.authorization).toEqual({
      params: { scope: 'openid email profile' }
    });
    expect(provider.checks).toEqual(['pkce', 'state']);
  });

  it('should handle minimal required options', () => {
    const minimalOptions = {
      clientId: 'minimal-client',
      name: 'Minimal Provider',
      id: 'minimal'
    };

    const provider = createOIDCProvider(minimalOptions);

    expect(provider.clientId).toBe('minimal-client');
    expect(provider.name).toBe('Minimal Provider');
    expect(provider.id).toBe('minimal');
    expect(provider.type).toBe('oidc');
  });
});
