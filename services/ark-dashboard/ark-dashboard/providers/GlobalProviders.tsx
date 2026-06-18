import { Provider as JotaiProvider } from 'jotai';
import { Suspense } from 'react';
import type { PropsWithChildren } from 'react';
import { Toaster } from 'sonner';

import { NavigationTracker } from '@/components/navigation-tracker';
import { SettingsKeyboardShortcut } from '@/components/settings/settings-keyboard-shortcut';
import { AnalyticsProvider } from '@/lib/analytics/provider';
import { ContextProvider } from '@/providers/ContextProvider';
import { NamespaceProvider } from '@/providers/NamespaceProvider';

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
                  <AnalyticsProvider>{children}</AnalyticsProvider>
                </NamespaceProvider>
              </ContextProvider>
            </Suspense>
          </QueryClientProvider>
        </AuthProvider>
        <SettingsKeyboardShortcut />
        <NavigationTracker />
        <Toaster richColors closeButton visibleToasts={5} />
      </ThemeProvider>
    </JotaiProvider>
  );
}
