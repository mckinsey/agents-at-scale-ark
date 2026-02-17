'use client';

import { PageHeader } from '@/components/common/page-header';
import { A2ATasksSection } from '@/components/sections/a2a-tasks-section';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useListA2ATasks } from '@/lib/services/a2a-tasks-hooks';

export default function TasksPage() {
  const { data } = useListA2ATasks();

  const pageTitle = data ? `A2A Tasks (${data.count})` : 'A2A Tasks';

  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Tasks" />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <A2ATasksSection />
      </div>
    </>
  );
}
