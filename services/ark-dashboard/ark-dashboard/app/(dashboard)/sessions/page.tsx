'use client';

import { PageHeader } from '@/components/common/page-header';
import { SessionsSection } from '@/components/sections/sessions-section';

export default function SessionsPage() {
  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col">
        <SessionsSection />
      </div>
    </>
  );
}
