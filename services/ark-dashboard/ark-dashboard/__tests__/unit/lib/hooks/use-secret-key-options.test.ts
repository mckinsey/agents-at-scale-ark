import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSecretKeyOptions } from '@/lib/hooks/use-secret-key-options';

const mockUseGetAllSecrets = vi.fn();

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: (...args: unknown[]) => mockUseGetAllSecrets(...args),
}));

describe('useSecretKeyOptions', () => {
  beforeEach(() => {
    mockUseGetAllSecrets.mockReset();
  });

  it('builds one option per key of each Opaque secret', () => {
    mockUseGetAllSecrets.mockReturnValue({
      data: [
        {
          name: 'github-token',
          display_name: 'GitHub token',
          type: 'Opaque',
          keys: ['token', 'org'],
          scope: 'personal',
        },
        { name: 'no-keys', display_name: 'No keys', type: 'Opaque' },
        {
          name: 'tls-cert',
          display_name: 'TLS cert',
          type: 'kubernetes.io/tls',
          keys: ['tls.crt'],
          scope: 'shared',
        },
      ],
      isSuccess: true,
      isError: false,
    });

    const { result } = renderHook(() =>
      useSecretKeyOptions({ scope: 'all', enabled: false }),
    );

    expect(mockUseGetAllSecrets).toHaveBeenCalledWith('all', {
      enabled: false,
    });
    expect(result.current).toEqual({
      loaded: true,
      options: [
        {
          value: 'github-token/token',
          label: 'GitHub token · token',
          secretName: 'github-token',
          secretKey: 'token',
          scope: 'personal',
        },
        {
          value: 'github-token/org',
          label: 'GitHub token · org',
          secretName: 'github-token',
          secretKey: 'org',
          scope: 'personal',
        },
      ],
    });
  });

  it('defaults to shared secrets and counts a failed load as loaded', () => {
    mockUseGetAllSecrets.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isError: true,
    });

    const { result } = renderHook(() => useSecretKeyOptions());

    expect(mockUseGetAllSecrets).toHaveBeenCalledWith('shared', {
      enabled: true,
    });
    expect(result.current).toEqual({ options: [], loaded: true });
  });
});
