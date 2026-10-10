'use client';

import { EventsSection } from '@/components/sections/events-section';
import { useGetEventsCount } from '@/lib/services/events-hooks';

export default function EventsPage() {
  const { data: eventsCount } = useGetEventsCount();

  return <EventsSection totalCount={eventsCount} />;
}
