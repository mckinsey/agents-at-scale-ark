'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { useNavigationGuardContext } from '@/lib/hooks/use-navigation-guard';

type NavigationOptions = Parameters<ReturnType<typeof useRouter>['push']>[1];

function buildFullPath(path: string, searchParams: URLSearchParams | null): string {
  const [pathname, pathQuery] = path.split('?');
  const merged = new URLSearchParams(searchParams?.toString() ?? '');

  if (pathQuery) {
    const pathParams = new URLSearchParams(pathQuery);
    for (const [key, value] of pathParams) {
      merged.set(key, value);
    }
  }

  const queryString = merged.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function useNamespacedNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const guard = useNavigationGuardContext();

  const push = useCallback(
    (path: string, options?: NavigationOptions) => {
      const fullPath = buildFullPath(path, searchParams);
      const doNav = () => {
        if (options) {
          router.push(fullPath, options);
        } else {
          router.push(fullPath);
        }
      };
      if (guard.requestNavigation(doNav)) {
        return;
      }
      doNav();
    },
    [router, searchParams, guard],
  );

  const replace = useCallback(
    (path: string, options?: NavigationOptions) => {
      const fullPath = buildFullPath(path, searchParams);
      const doNav = () => {
        if (options) {
          router.replace(fullPath, options);
        } else {
          router.replace(fullPath);
        }
      };
      if (guard.requestNavigation(doNav)) {
        return;
      }
      doNav();
    },
    [router, searchParams, guard],
  );

  return { push, replace };
}
