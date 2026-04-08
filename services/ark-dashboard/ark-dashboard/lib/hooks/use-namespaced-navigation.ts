'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

type NavigationOptions = Parameters<ReturnType<typeof useRouter>['push']>[1];

export function useNamespacedNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const push = useCallback(
    (path: string, options?: NavigationOptions) => {
      const [pathname, pathQuery] = path.split('?');
      const merged = new URLSearchParams(searchParams?.toString() ?? '');

      if (pathQuery) {
        const pathParams = new URLSearchParams(pathQuery);
        for (const [key, value] of pathParams) {
          merged.set(key, value);
        }
      }

      const queryString = merged.toString();
      const fullPath = queryString ? `${pathname}?${queryString}` : pathname;

      if (options) {
        router.push(fullPath, options);
      } else {
        router.push(fullPath);
      }
    },
    [router, searchParams],
  );

  return { push };
}
