import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { brokerStreamsService } from '@/lib/services/broker-streams';
import {
  BROKER_STREAM_PROBE_QUERY_KEY,
  probeRefetchInterval,
  useBrokerStreamProbe,
} from '@/lib/services/broker-streams-hooks';

vi.mock('@/lib/services/broker-streams', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/services/broker-streams')>();
  return {
    ...actual,
    brokerStreamsService: { probeAll: vi.fn() },
  };
});

beforeEach(() => {
  vi.mocked(brokerStreamsService.probeAll).mockResolvedValue('empty');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('probeRefetchInterval', () => {
  it('stops polling once a stream holds records', () => {
    expect(probeRefetchInterval('has-records', 1)).toBe(false);
    expect(probeRefetchInterval('has-records', 9)).toBe(false);
  });

  it('backs off exponentially while every stream is empty', () => {
    expect(probeRefetchInterval('empty', 1)).toBe(5000);
    expect(probeRefetchInterval('empty', 2)).toBe(10000);
    expect(probeRefetchInterval('empty', 3)).toBe(20000);
  });

  it('caps the backoff at 30s', () => {
    expect(probeRefetchInterval('empty', 4)).toBe(30000);
    expect(probeRefetchInterval('empty', 50)).toBe(30000);
  });

  it('uses the base interval before the first result lands', () => {
    expect(probeRefetchInterval(undefined, 0)).toBe(5000);
  });

  it('gives up on an unreachable broker instead of retrying forever', () => {
    expect(probeRefetchInterval('unknown', 4)).toBe(30000);
    expect(probeRefetchInterval('unknown', 5)).toBe(false);
    expect(probeRefetchInterval('unknown', 20)).toBe(false);
  });
});

describe('useBrokerStreamProbe', () => {
  function renderProbe(memory: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useBrokerStreamProbe(memory), { wrapper });
    return { queryClient, ...view };
  }

  function attemptsFor(queryClient: QueryClient, memory: string) {
    return queryClient.getQueryState([BROKER_STREAM_PROBE_QUERY_KEY, memory])
      ?.dataUpdateCount;
  }

  it('advances the attempt counter the backoff reads, even on an unchanged result', async () => {
    const { queryClient } = renderProbe('default');

    await waitFor(() => {
      expect(attemptsFor(queryClient, 'default')).toBe(1);
    });

    await queryClient.refetchQueries({
      queryKey: [BROKER_STREAM_PROBE_QUERY_KEY, 'default'],
    });
    await queryClient.refetchQueries({
      queryKey: [BROKER_STREAM_PROBE_QUERY_KEY, 'default'],
    });

    // 'empty' every time, so the value never changes - the backoff still has to
    // escalate, which only works if the counter tracks attempts not changes.
    expect(attemptsFor(queryClient, 'default')).toBe(3);
    expect(probeRefetchInterval('empty', 3)).toBe(20000);
  });

  it('restarts the backoff for a different memory', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { rerender } = renderHook(
      ({ memory }: { memory: string }) => useBrokerStreamProbe(memory),
      { wrapper, initialProps: { memory: 'default' } },
    );

    await waitFor(() => {
      expect(attemptsFor(queryClient, 'default')).toBe(1);
    });
    await queryClient.refetchQueries({
      queryKey: [BROKER_STREAM_PROBE_QUERY_KEY, 'default'],
    });
    expect(attemptsFor(queryClient, 'default')).toBe(2);

    rerender({ memory: 'other' });

    await waitFor(() => {
      expect(attemptsFor(queryClient, 'other')).toBe(1);
    });
  });

  it('does not probe until enabled', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useBrokerStreamProbe('default', { enabled: false }), {
      wrapper,
    });

    expect(brokerStreamsService.probeAll).not.toHaveBeenCalled();
  });
});
