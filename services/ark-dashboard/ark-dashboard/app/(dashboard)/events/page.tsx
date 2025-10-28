import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { EventsSection } from '@/components/sections/events-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

type SearchParams = {
  page?: string;
  limit?: string;
  type?: string;
  kind?: string;
  name?: string;
};

const defaultPage = 1;
const defaultLimit = 10;

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function EventsPage({ searchParams }: PageProps) {
  const filters = await searchParams;

  const parsedFilters = {
    page: filters.page ? parseInt(filters.page, 10) : defaultPage,
    limit: filters.limit ? parseInt(filters.limit, 10) : defaultLimit,
    type: filters.type,
    kind: filters.kind,
    name: filters.name,
  };

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Events" />
      <div className="flex flex-1 flex-col">
        <EventsSection {...parsedFilters} />
      </div>
    </>
  );
}
