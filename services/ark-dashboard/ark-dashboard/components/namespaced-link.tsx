'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';

type NamespacedLinkProps = ComponentProps<typeof Link>;

function NamespacedLink({ href, ...props }: NamespacedLinkProps) {
  const searchParams = useSearchParams();
  const hrefString = typeof href === 'string' ? href : href.pathname ?? '';

  const isExternal =
    hrefString.startsWith('http://') || hrefString.startsWith('https://');

  if (isExternal) {
    return <Link href={href} {...props} />;
  }

  const [pathname, pathQuery] = hrefString.split('?');
  const merged = new URLSearchParams(searchParams?.toString() ?? '');

  if (pathQuery) {
    const pathParams = new URLSearchParams(pathQuery);
    for (const [key, value] of pathParams) {
      merged.set(key, value);
    }
  }

  const queryString = merged.toString();
  const fullHref = queryString ? `${pathname}?${queryString}` : pathname;

  return <Link href={fullHref} {...props} />;
}

export { NamespacedLink };
