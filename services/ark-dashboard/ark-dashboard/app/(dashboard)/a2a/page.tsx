'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { A2AServersSection } from '@/components/sections/a2a-servers-section';
import type { A2AServersSectionHandle } from '@/components/sections/a2a-servers-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function A2APage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const a2aSectionRef = useRef<A2AServersSectionHandle>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="A2A Servers"
        actions={
          <Button onClick={() => a2aSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add A2A Server
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <A2AServersSection ref={a2aSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
