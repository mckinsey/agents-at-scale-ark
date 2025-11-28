'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { A2ATasksSection } from '@/components/sections/a2a-tasks-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function TasksPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="A2A Tasks" />
      <A2ATasksSection />
    </>
  );
}
