'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { TeamsSection } from '@/components/sections/teams-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function TeamsPage() {
  const teamsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Teams"
        actions={
          <Button onClick={() => teamsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <TeamsSection ref={teamsSectionRef} />
      </div>
    </>
  );
}
