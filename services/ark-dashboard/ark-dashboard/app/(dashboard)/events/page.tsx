'use client';

import { useSearchParams } from 'next/navigation';

import { EventsSection } from '@/components/sections/events-section';
import { useGetEventsCount } from '@/lib/services/events-hooks';

const defaultPage = 1;
const defaultLimit = 10;

export default function EventsPage() {
  const searchParams = useSearchParams();
  const { data: eventsCount } = useGetEventsCount();

  const parsedFilters = {
    page: searchParams.get('page')
      ? parseInt(searchParams.get('page')!, 10)
      : defaultPage,
    limit: searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : defaultLimit,
    type: searchParams.get('type') || undefined,
    kind: searchParams.get('kind') || undefined,
    name: searchParams.get('name') || undefined,
  };

  return <EventsSection {...parsedFilters} totalCount={eventsCount} />;
}
