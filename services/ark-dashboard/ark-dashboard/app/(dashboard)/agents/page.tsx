'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { AgentsSection } from '@/components/sections/agents-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Agents"
        actions={
          <Button asChild>
            <Link href="/agents/new">
              <Plus className="h-4 w-4" />
              Create Agent
            </Link>
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <AgentsSection />
      </div>
    </>
  );
}
