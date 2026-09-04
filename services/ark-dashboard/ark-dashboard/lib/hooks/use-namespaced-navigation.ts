'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { useNavigationGuardContext } from '@/lib/hooks/use-navigation-guard';
import { buildScopedPath } from '@/lib/utils/param-scope';

type NavigationOptions = Parameters<ReturnType<typeof useRouter>['push']>[1];

export function useNamespacedNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const guard = useNavigationGuardContext();

  const push = useCallback(
    (path: string, options?: NavigationOptions) => {
      const fullPath = buildScopedPath(path, searchParams, pathname);
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
    [router, searchParams, pathname, guard],
  );

  const replace = useCallback(
    (path: string, options?: NavigationOptions) => {
      const fullPath = buildScopedPath(path, searchParams, pathname);
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
    [router, searchParams, pathname, guard],
  );

  return { push, replace };
}
