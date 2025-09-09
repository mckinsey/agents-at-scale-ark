"use client"

import ChatManager from "@/components/chat-manager";
import { ChatProvider } from "@/lib/chat-context";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAutoSignout } from "@/hooks/useAutoSignout";
import { useRefreshAccessToken } from "@/hooks/useSession";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  useAutoSignout()
  useRefreshAccessToken()

  return (
    <ChatProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
      <ChatManager />
      <Toaster />
    </ChatProvider>
  );
}
