'use client';

import { AppSidebar } from '@/components/app-sidebar';
import ChatManager from '@/components/chat-manager';
import { SettingsModal } from '@/components/settings-modal';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { useNamespace } from '@/providers/NamespaceProvider';

import './layout.css';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isNamespaceResolved } = useNamespace();

  if (!isNamespaceResolved) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-2">
        <Spinner className="mr-2" />
        <div className="muted text-lg font-semibold">
          Loading ARK Dashboard...
        </div>
      </div>
    );
  }

  return (
    <>
      <SidebarProvider
        style={
          {
            '--sidebar-width-icon': '5rem',
          } as React.CSSProperties
        }>
        <AppSidebar />
        <SidebarInset className="ml-8 min-w-0 p-10 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]">
          {children}
        </SidebarInset>
      </SidebarProvider>
      <SettingsModal />
      <ChatManager />
    </>
  );
}
