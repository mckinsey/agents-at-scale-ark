'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

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

  const push = useCallback(
    (path: string, options?: NavigationOptions) => {
      const fullPath = buildFullPath(path, searchParams);
      if (options) {
        router.push(fullPath, options);
      } else {
        router.push(fullPath);
      }
    },
    [router, searchParams],
  );

  const replace = useCallback(
    (path: string, options?: NavigationOptions) => {
      const fullPath = buildFullPath(path, searchParams);
      if (options) {
        router.replace(fullPath, options);
      } else {
        router.replace(fullPath);
      }
    },
    [router, searchParams],
  );

  return { push, replace };
}
