'use client';

import { useAtomValue } from 'jotai';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

import { isExperimentalDarkModeEnabledAtom } from '@/atoms/experimental-features';

export function ThemeProvider({
  children,
}: React.ComponentProps<typeof NextThemesProvider>) {
  const isExperimentalDarkModeEnabled = useAtomValue(
    isExperimentalDarkModeEnabledAtom,
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme={isExperimentalDarkModeEnabled ? 'dark' : undefined}
      enableSystem
      disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
