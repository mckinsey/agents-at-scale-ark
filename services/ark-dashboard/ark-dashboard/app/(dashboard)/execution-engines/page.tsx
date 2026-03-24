'use client';

import { PageHeader } from '@/components/common/page-header';
import { ExecutionEnginesSection } from '@/components/sections/execution-engines-section';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useGetAllExecutionEngines } from '@/lib/services/engines-hooks';

export default function ExecutionEnginesPage() {
  const { data: engines } = useGetAllExecutionEngines();

  const pageTitle = engines
    ? `Execution Engines (${engines.length})`
    : 'Execution Engines';

  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Execution Engines" />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <ExecutionEnginesSection />
      </div>
    </>
  );
}
