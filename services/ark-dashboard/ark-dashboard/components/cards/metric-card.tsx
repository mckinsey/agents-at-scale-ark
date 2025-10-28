'use client';

import { AlertTriangle, ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function LoadingState() {
  return (
    <div className="flex w-full flex-col space-y-2">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export type Props = {
  title: string;
  value: number | string;
  Icon: LucideIcon;
  href: ComponentProps<typeof Link>['href'];
  isLoading: boolean;
  hasError: boolean;
};

export function MetricCard({
  title,
  value,
  Icon,
  href,
  isLoading,
  hasError,
}: Props) {
  return (
    <Link href={href}>
      <Card
        className={cn(
          'group hover:border-primary/50 hover:shadow-primary/10 cursor-pointer transition-all duration-200 hover:shadow-lg',
          hasError && 'border-destructive/50 bg-destructive/5',
        )}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle
            className={cn(
              'text-foreground group-hover:text-primary text-sm font-medium transition-colors',
              hasError && 'text-destructive',
            )}>
            {title}
          </CardTitle>
          <div
            className={cn(
              'text-foreground group-hover:text-primary transition-colors',
              hasError && 'text-destructive',
            )}>
            {hasError ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-14 items-center justify-between">
            {hasError ? (
              <div className="flex flex-col space-y-2">
                <div className="text-destructive text-2xl font-bold">!</div>
                <p className="text-destructive text-xs">Failed to fetch data</p>
              </div>
            ) : isLoading ? (
              <LoadingState />
            ) : !value ? (
              <div className="flex flex-col space-y-2">
                <div className="text-muted-foreground text-2xl font-bold">
                  —
                </div>
                <p className="text-muted-foreground text-xs">
                  No data available
                </p>
              </div>
            ) : (
              <div className="self-start text-2xl font-bold">{value}</div>
            )}
            <ChevronRight
              className={cn(
                'text-muted-foreground group-hover:text-primary h-4 w-4 transition-colors',
                hasError && 'text-destructive',
              )}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
