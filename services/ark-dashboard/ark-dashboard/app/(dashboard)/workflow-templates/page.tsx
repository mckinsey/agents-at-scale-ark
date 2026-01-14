'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function WorkflowTemplatesPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Workflow Templates" />
      <div className="flex flex-1 flex-col">
        <WorkflowTemplatesSection />
      </div>
    </>
  );
}
