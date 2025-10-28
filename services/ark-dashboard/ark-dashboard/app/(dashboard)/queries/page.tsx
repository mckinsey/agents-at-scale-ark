'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { QueriesSection } from '@/components/sections/queries-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function QueriesPage() {
  const queriesSectionRef = useRef<{ openAddEditor: () => void }>(null);
  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Queries"
        actions={
          <Button onClick={() => queriesSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Query
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <QueriesSection ref={queriesSectionRef} />
      </div>
    </>
  );
}
