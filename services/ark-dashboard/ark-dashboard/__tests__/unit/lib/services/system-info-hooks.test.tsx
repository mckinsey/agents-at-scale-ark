import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGetSystemInfo } from '@/lib/services/system-info-hooks';
import { systemInfoService } from '@/lib/services/system-info';

vi.mock('@/lib/services/system-info', () => ({
  systemInfoService: {
    get: vi.fn(),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useGetSystemInfo', () => {
  it('fetches system info through the service', async () => {
    vi.mocked(systemInfoService.get).mockResolvedValue({
      kubernetes_version: 'v1.31.2',
      system_version: 'v0.1.68',
      argo_server_version_supported: true,
    });

    const { result } = renderHook(() => useGetSystemInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.argo_server_version_supported).toBe(true);
    expect(systemInfoService.get).toHaveBeenCalled();
  });
});
