"use client";

import { isExperimentalFeaturesEnabledAtom } from "@/atoms/experimental-features";
import { AppSidebar } from "@/components/app-sidebar";
import ChatManager from "@/components/chat-manager";
import { ExperimentalFeaturesDialog } from "@/components/experimental-features-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useNamespace } from "@/providers/NamespaceProvider";
import { useAtomValue } from "jotai";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isNamespaceResolved } = useNamespace();
  const isExperimentalFeaturesEnabled = useAtomValue(isExperimentalFeaturesEnabledAtom)

  if (!isNamespaceResolved) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-2">
        <Spinner className="mr-2" />
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
      {isExperimentalFeaturesEnabled && (<ExperimentalFeaturesDialog />)}
      <ChatManager />
    </>
  );
}
