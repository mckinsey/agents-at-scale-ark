'use client';

import { Code, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { AgentsSection } from '@/components/sections/agents-section';
import { Button } from '@/components/ui/button';
import { useGetAllAgents } from '@/lib/services/agents-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

interface AgentsSectionHandle {
  openAddEditor: () => void;
  openApiDialog: () => void;
}

export default function AgentsPage() {
  const agentsSectionRef = useRef<AgentsSectionHandle>(null);
  const { readOnlyMode } = useNamespace();
  const { data: agents } = useGetAllAgents();

  const pageTitle = agents ? `Agents (${agents.length})` : 'Agents';

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
            {readOnlyMode ? (
              <Button disabled>
                <Plus className="h-4 w-4" />
                Create Agent
              </Button>
            ) : (
              <Button asChild>
                <Link href="/agents/new">
                  <Plus className="h-4 w-4" />
                  Create Agent
                </Link>
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <AgentsSection ref={agentsSectionRef} />
      </div>
    </>
  );
}
