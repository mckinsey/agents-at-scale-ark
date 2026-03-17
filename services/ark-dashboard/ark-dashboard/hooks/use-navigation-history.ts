'use client';

import { useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { hasSoftNavigatedAtom } from '@/atoms/navigation-history';

export function NavigationTracker() {
  const pathname = usePathname();
  const setHasSoftNavigated = useSetAtom(hasSoftNavigatedAtom);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setHasSoftNavigated(true);
  }, [pathname, setHasSoftNavigated]);

  return null;
}
