'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { ToolsSection } from '@/components/sections/tools-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function ToolsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const toolsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Tools"
        actions={
          <Button onClick={() => toolsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add Tool
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <ToolsSection ref={toolsSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
