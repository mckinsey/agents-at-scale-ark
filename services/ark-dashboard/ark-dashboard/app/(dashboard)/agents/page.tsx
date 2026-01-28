'use client';

import { Code, Plus } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { AgentsSection } from '@/components/sections/agents-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

interface AgentsSectionHandle {
  openAddEditor: () => void;
  openApiDialog: () => void;
}

export default function AgentsPage() {
  const agentsSectionRef = useRef<AgentsSectionHandle>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Agents"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => agentsSectionRef.current?.openApiDialog()}>
              <Code className="h-4 w-4" />
              Use via API
            </Button>
            <Button onClick={() => agentsSectionRef.current?.openAddEditor()}>
              <Plus className="h-4 w-4" />
              Create Agent
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 flex-col">
        <AgentsSection ref={agentsSectionRef} />
      </div>
    </>
  );
}
