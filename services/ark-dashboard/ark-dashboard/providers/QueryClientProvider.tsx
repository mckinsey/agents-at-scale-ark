'use client';

import {
  QueryClient,
  QueryClientProvider as ReactQueryClientProvider,
} from '@tanstack/react-query';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';

export function QueryClientProvider({ children }: PropsWithChildren) {
  // Prevents QueryClient from being recreated on each render
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            // Serve cached data instantly, then revalidate in the background
            // only when the entry is stale. refetchOnMount: true respects
            // staleTime; 'always' would refetch on every mount and defeat the
            // cache. Mutations invalidate their lists, so data stays fresh on
            // any user action regardless of staleTime.
            refetchOnMount: true,
            refetchOnReconnect: true,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <ReactQueryClientProvider client={queryClient}>
      {children}
    </ReactQueryClientProvider>
  );
}
