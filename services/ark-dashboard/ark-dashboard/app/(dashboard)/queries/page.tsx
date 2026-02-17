'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { QueriesSection } from '@/components/sections/queries-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useListQueries } from '@/lib/services/queries-hooks';

export default function QueriesPage() {
  const queriesSectionRef = useRef<{ openAddEditor: () => void }>(null);
  const { data: queries } = useListQueries();

  const pageTitle = queries ? `Queries (${queries.count})` : 'Queries';

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Queries"
        actions={
          <Button onClick={() => queriesSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Query
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <QueriesSection ref={queriesSectionRef} />
      </div>
    </>
  );
}
