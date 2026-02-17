'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { ToolsSection } from '@/components/sections/tools-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function ToolsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const toolsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Tools"
        actions={
          <Button onClick={() => toolsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add Tool
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">Tools</h1>
        </div>
        <ToolsSection ref={toolsSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
