'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { AgentsSection } from '@/components/sections/agents-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function AgentsPage() {
  const agentsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Agents"
        actions={
          <Button onClick={() => agentsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Agent
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <AgentsSection ref={agentsSectionRef} />
      </div>
    </>
  );
}
