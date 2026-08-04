'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { ChevronRight } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Card } from '@/components/ui/card';
import { IconShell } from '@/components/ui/icon-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type Props = {
  title: string;
  value: number | string;
  href: ComponentProps<typeof Link>['href'];
  isLoading: boolean;
  hasError: boolean;
};

export function MetricCard({
  title,
  value,
  href,
  isLoading,
  hasError,
}: Readonly<Props>) {
  return (
    <NamespacedLink
      href={href}
      className="group/card focus-visible:ring-stroke-status-focus block rounded-none outline-none focus-visible:ring-2">
      <Card className="hover:bg-stateslayer-overlay-hover gap-3 bg-transparent p-3 transition-colors">
        <p
          className={cn(
            'text-fg-secondary text-base font-semibold leading-6 tracking-[-0.016px]',
            hasError && 'text-destructive',
          )}>
          {title}
        </p>
        {isLoading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <p
            className={cn(
              'text-fg-primary text-2xl font-semibold leading-8 tracking-[-0.096px]',
              hasError && 'text-destructive',
            )}>
            {hasError ? '!' : value}
          </p>
        )}
        <span className="text-fg-primary flex items-center gap-1 text-sm font-medium leading-5 group-hover/card:underline">
          See all
          <IconShell size="sm">
            <ChevronRight />
          </IconShell>
        </span>
      </Card>
    </NamespacedLink>
  );
}
