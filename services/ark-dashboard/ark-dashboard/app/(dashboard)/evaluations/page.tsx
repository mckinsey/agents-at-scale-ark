'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { EvaluationsSection } from '@/components/sections';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function EvaluationsPage() {
  const searchParams = useSearchParams();
  const queryFilter = searchParams.get('query');
  const evaluationsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Evaluations"
        actions={
          <Button
            onClick={() => evaluationsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Create Evaluation
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EvaluationsSection
          ref={evaluationsSectionRef}
          initialQueryFilter={queryFilter}
        />
      </div>
    </>
  );
}
