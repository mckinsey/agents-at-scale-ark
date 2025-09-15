"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import ChatManager from "@/components/chat-manager";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { ChatProvider } from "@/lib/chat-context";

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
      <ChatProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
        <ChatManager />
        <Toaster />
      </ChatProvider>
    </QueryClientProvider>
  );
}
