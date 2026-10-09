import { Provider as JotaiProvider } from 'jotai';
import { Suspense } from 'react';
import type { PropsWithChildren } from 'react';

import { NavigationTracker } from '@/components/navigation-tracker';
import { SettingsKeyboardShortcut } from '@/components/settings/settings-keyboard-shortcut';
import { Toaster } from '@/components/ui/sonner';
import { AnalyticsProvider } from '@/lib/analytics/provider';
import { normalizeArgoUrl } from '@/lib/utils/argo-url';
import { ContextProvider } from '@/providers/ContextProvider';
import { NamespaceProvider } from '@/providers/NamespaceProvider';
import { ArgoUrlProvider } from '@/providers/argo-url-provider';

import { OpenModeProvider, SSOModeProvider } from './AuthProviders';
import { QueryClientProvider } from './QueryClientProvider';
import { ThemeProvider } from './ThemeProvider';

export function GlobalProviders({ children }: PropsWithChildren) {
  const isSSOEnabled = process.env.AUTH_MODE === 'sso';
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
              }>
              <ContextProvider enabled={isSSOEnabled}>
                <NamespaceProvider>
                  <ArgoUrlProvider
                    argoUrl={normalizeArgoUrl(process.env.ARGO_URL)}>
                    <AnalyticsProvider>{children}</AnalyticsProvider>
                  </ArgoUrlProvider>
                </NamespaceProvider>
              </ContextProvider>
            </Suspense>
          </QueryClientProvider>
        </AuthProvider>
        <SettingsKeyboardShortcut />
        <Suspense fallback={null}>
          <NavigationTracker />
        </Suspense>
        <Toaster visibleToasts={5} position="top-right" />
      </ThemeProvider>
    </JotaiProvider>
  );
}
