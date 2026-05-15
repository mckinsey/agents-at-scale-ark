'use client';

import { useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';

export function NavigationTracker() {
  const pathname = usePathname();
  const setSettingsEntryUrl = useSetAtom(settingsEntryUrlAtom);
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    const isEnteringSettings =
      pathname.startsWith('/settings') &&
      previousPathname.current !== null &&
      !previousPathname.current.startsWith('/settings');

    if (isEnteringSettings) {
      setSettingsEntryUrl(previousPathname.current);
    }

    if (!pathname.startsWith('/settings')) {
      setSettingsEntryUrl(null);
    }

    previousPathname.current = pathname;
  }, [pathname, setSettingsEntryUrl]);

  return null;
}
