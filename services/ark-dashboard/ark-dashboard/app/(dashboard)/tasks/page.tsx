'use client';

import { PageHeader } from '@/components/common/page-header';
import { A2ATasksSection } from '@/components/sections/a2a-tasks-section';
import { useListA2ATasks } from '@/lib/services/a2a-tasks-hooks';

export default function TasksPage() {
  const { data } = useListA2ATasks();

  const pageTitle = data ? `A2A Tasks (${data.count})` : 'A2A Tasks';

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <A2ATasksSection />
      </div>
    </>
  );
}
