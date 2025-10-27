'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useGetMemoryResources } from '@/lib/services/memory-hooks';

import { MetricCard } from './metric-card';

export function HomepageMemoryCard() {
  const { data, isPending, error } = useGetMemoryResources();

  const count = data?.length || 0;

  const section = DASHBOARD_SECTIONS.memory;
  const href = `/${section.key}`;

  useEffect(() => {
    if (error) {
      toast.error('Failed to get Memory', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [error]);

  return (
    <MetricCard
      key={section.key}
      title={section.title}
      value={count}
      Icon={section.icon}
      href={href}
      isLoading={isPending}
      hasError={Boolean(error)}
    />
  );
}
