"use client";

import { AppSidebar } from "@/components/app-sidebar";
import ChatManager from "@/components/chat-manager";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useNamespace } from "@/providers/NamespaceProvider";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isNamespaceResolved } = useNamespace();

  if (!isNamespaceResolved) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-2">
        <Loader2 className="mr-2 h-10 w-10 animate-spin" />
        <div className="text-lg font-semibold muted">
          Loading ARK Dashboard...
        </div>
      </div>
    );
  }

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
      <ChatManager />
    </>
  );
}
