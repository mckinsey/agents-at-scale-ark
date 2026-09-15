'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { forwardRef, type ComponentProps, type MouseEvent } from 'react';

import { useNavigationGuardContext } from '@/lib/hooks/use-navigation-guard';
import { buildScopedPath } from '@/lib/utils/param-scope';

type NamespacedLinkProps = ComponentProps<typeof Link>;

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

const NamespacedLink = forwardRef<HTMLAnchorElement, NamespacedLinkProps>(
  function NamespacedLink({ href, onClick, target, ...props }, ref) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const guard = useNavigationGuardContext();
    const hrefString = typeof href === 'string' ? href : href.pathname ?? '';

    const isExternal =
      hrefString.startsWith('http://') || hrefString.startsWith('https://');

    if (isExternal) {
      return (
        <Link
          ref={ref}
          href={href}
          onClick={onClick}
          target={target}
          {...props}
        />
      );
    }

    const fullHref = buildScopedPath(hrefString, searchParams, pathname);

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        target === '_blank' ||
        isModifiedEvent(event)
      ) {
        return;
      }
      if (guard.requestNavigation(() => guard.navigateHref(fullHref))) {
        event.preventDefault();
      }
    };

    return (
      <Link
        ref={ref}
        href={fullHref}
        onClick={handleClick}
        target={target}
        {...props}
      />
    );
  },
);

export { NamespacedLink };
