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
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
        // Disable all window switch application switch refetch
      }),
  );

  return (
    <ReactQueryClientProvider client={queryClient}>
      {children}
    </ReactQueryClientProvider>
  );
}
