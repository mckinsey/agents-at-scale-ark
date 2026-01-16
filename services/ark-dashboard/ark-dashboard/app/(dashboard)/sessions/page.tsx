'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { SessionsSection } from '@/components/sections/sessions-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function SessionsPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Sessions" />
      <div className="flex flex-1 flex-col">
        <SessionsSection />
      </div>
    </>
  );
}
