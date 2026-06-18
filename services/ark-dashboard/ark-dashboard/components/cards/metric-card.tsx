'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { ChevronRight } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
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

export function MetricCard({ title, value, href, isLoading, hasError }: Props) {
  return (
    <Card className="gap-3 bg-transparent p-3">
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
      <NamespacedLink href={href}>
        <Button variant="ghost" size="sm" className="-ml-2">
          See all
          <IconShell size="sm">
            <ChevronRight />
          </IconShell>
        </Button>
      </NamespacedLink>
    </Card>
  );
}
