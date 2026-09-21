'use client';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {
  lastListUrlAtom,
  settingsEntryUrlAtom,
} from '@/atoms/navigation-history';
import { APP_SCOPED_PARAMS } from '@/lib/utils/param-scope';

const SETTINGS_PREFIX = '/settings';

function isListRoute(pathname: string): boolean {
  return pathname.split('/').filter(Boolean).length === 1;
}

function buildReturnUrl(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const params = new URLSearchParams(searchParams.toString());
  for (const key of APP_SCOPED_PARAMS) {
    params.delete(key);
  }
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function NavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setSettingsEntryUrl = useSetAtom(settingsEntryUrlAtom);
  const setLastListUrl = useSetAtom(lastListUrlAtom);
  const previousUrl = useRef<string | null>(null);

  useEffect(() => {
    const returnUrl = buildReturnUrl(pathname, searchParams);

    if (pathname.startsWith(SETTINGS_PREFIX)) {
      const entry = previousUrl.current;
      if (entry !== null && !entry.startsWith(SETTINGS_PREFIX)) {
        setSettingsEntryUrl(entry);
      }
    } else {
      setSettingsEntryUrl(null);
      if (isListRoute(pathname)) {
        setLastListUrl(previous =>
          previous[pathname] === returnUrl
            ? previous
            : { ...previous, [pathname]: returnUrl },
        );
      }
    }

    previousUrl.current = returnUrl;
  }, [pathname, searchParams, setSettingsEntryUrl, setLastListUrl]);

  return null;
}
