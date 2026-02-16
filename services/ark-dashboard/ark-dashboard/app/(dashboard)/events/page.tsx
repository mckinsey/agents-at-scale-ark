'use client';

import { useSearchParams } from 'next/navigation';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { EventsSection } from '@/components/sections/events-section';
import { useGetEventsCount } from '@/lib/services/events-hooks';

const defaultPage = 1;
const defaultLimit = 10;
const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

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

  const pageTitle =
    eventsCount !== undefined ? `Query Logs (${eventsCount})` : 'Query Logs';

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Query Logs" />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <EventsSection {...parsedFilters} />
      </div>
    </>
  );
}
