'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { FlowLogsSection } from '@/components/sections/flow-logs-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function FlowLogsPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Flow Logs" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <FlowLogsSection />
      </div>
    </>
  );
}
