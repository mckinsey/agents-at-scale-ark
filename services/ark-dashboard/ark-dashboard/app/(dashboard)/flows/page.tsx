'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import {
  FlowsSection,
  type FlowsSectionRef,
} from '@/components/sections/flows-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function FlowsPage() {
  const flowsSectionRef = useRef<FlowsSectionRef>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Flows"
        actions={
          <Button onClick={() => flowsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Flow
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <FlowsSection ref={flowsSectionRef} />
      </div>
    </>
  );
}
