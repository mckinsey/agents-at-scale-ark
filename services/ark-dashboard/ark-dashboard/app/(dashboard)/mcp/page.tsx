'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { McpServersSection } from '@/components/sections/mcp-servers-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function McpPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const mcpSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="MCP Servers"
        actions={
          <Button onClick={() => mcpSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add MCP Server
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <McpServersSection ref={mcpSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
