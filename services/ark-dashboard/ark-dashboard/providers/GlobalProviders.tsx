import { Suspense } from "react";
import { ChatProvider } from "@/lib/chat-context";
import { NamespaceProvider } from "@/providers/NamespaceProvider";
import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "./QueryClientProvider";
import { SSOModeProvider, OpenModeProvider } from "./AuthProviders";
import { Provider as JotaiProvider } from 'jotai'
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "sonner";

export function GlobalProviders({ children }: PropsWithChildren) {
  const isSSOEnabled = process.env.AUTH_MODE === "sso";
  const AuthProvider = isSSOEnabled ? SSOModeProvider : OpenModeProvider;

  return (
    <JotaiProvider>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider>
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
        </AuthProvider>
        <Toaster richColors closeButton visibleToasts={5} />
      </ThemeProvider>
    </JotaiProvider>
  );
}
