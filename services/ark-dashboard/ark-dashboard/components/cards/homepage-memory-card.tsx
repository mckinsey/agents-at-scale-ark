'use client';

import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useGetMemoryResources } from '@/lib/services/memory-hooks';

import { MetricCard } from './metric-card';

export function HomepageMemoryCard() {
  const { data, isPending, error } = useGetMemoryResources();

  const count = data?.length || 0;

  const section = DASHBOARD_SECTIONS.memory;
  const href = `/${section.key}`;

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
