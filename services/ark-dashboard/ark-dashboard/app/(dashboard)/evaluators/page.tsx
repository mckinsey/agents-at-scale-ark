'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { EvaluatorsSection } from '@/components/sections';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function EvaluatorsPage() {
  const evaluatorsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
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
