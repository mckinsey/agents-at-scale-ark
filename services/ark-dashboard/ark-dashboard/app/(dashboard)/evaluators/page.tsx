'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { EvaluatorsSection } from '@/components/sections';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function EvaluatorsPage() {
  const evaluatorsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Evaluators"
        actions={
          <Button onClick={() => evaluatorsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add Evaluator
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EvaluatorsSection ref={evaluatorsSectionRef} />
      </div>
    </>
  );
}
