'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { A2AServersSection } from '@/components/sections/a2a-servers-section';
import type { A2AServersSectionHandle } from '@/components/sections/a2a-servers-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function A2APage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const a2aSectionRef = useRef<A2AServersSectionHandle>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="A2A"
        actions={
          <Button onClick={() => a2aSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add A2A Server
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">A2A Servers</h1>
        </div>
        <A2AServersSection ref={a2aSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
