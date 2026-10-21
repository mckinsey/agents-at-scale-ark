import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { systemInfoService } from '@/lib/services/system-info';
import { useGetSystemInfo } from '@/lib/services/system-info-hooks';

vi.mock('@/lib/services/system-info', () => ({
  systemInfoService: {
    get: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe('useGetSystemInfo', () => {
  it('returns the system info reported by ark-api', async () => {
    const info = {
      kubernetes_version: 'v1.31.2',
      system_version: 'v0.1.72',
      argo_server_configured: false,
    };
    vi.mocked(systemInfoService.get).mockResolvedValue(info);

    const { result } = renderHook(() => useGetSystemInfo(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(info);
    expect(systemInfoService.get).toHaveBeenCalledTimes(1);
  });

  it('surfaces the Argo Server version support field', async () => {
    vi.mocked(systemInfoService.get).mockResolvedValue({
      kubernetes_version: 'v1.31.2',
      system_version: 'v0.1.68',
      argo_server_configured: true,
      argo_server_version_supported: true,
    });

    const { result } = renderHook(() => useGetSystemInfo(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.argo_server_version_supported).toBe(true);
  });
});
