"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import ChatManager from "@/components/chat-manager";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatProvider } from "@/lib/chat-context";
import { NamespaceProvider } from "@/providers/NamespaceProvider";

export function Providers({ children }: { children: React.ReactNode }) {
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
      <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
        <NamespaceProvider>
          <ChatProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>{children}</SidebarInset>
            </SidebarProvider>
            <ChatManager />
          </ChatProvider>
        </NamespaceProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
