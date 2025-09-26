"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { ChatProvider } from "@/lib/chat-context";
import { NamespaceProvider } from "@/providers/NamespaceProvider";
import type { PropsWithChildren } from "react";

export function GlobalProviders({ children }: PropsWithChildren) {
  // Prevents QueryClient from being recreated on each render
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } }
        // Disable all window switch application switch refetch
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            Loading...
          </div>
        }
      >
        <NamespaceProvider>
          <ChatProvider>{children}</ChatProvider>
        </NamespaceProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
