'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { EvaluationsSection, EvaluatorsSection } from '@/components/sections';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function EvalsPage() {
  const searchParams = useSearchParams();
  const queryFilter = searchParams.get('query');
  const [activeTab, setActiveTab] = useState('evaluations');
  const evaluationsSectionRef = useRef<{ openAddEditor: () => void }>(null);
  const evaluatorsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Evals"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => evaluatorsSectionRef.current?.openAddEditor()}>
              <Plus className="h-4 w-4" />
              Add Evaluator
            </Button>
            <Button
              onClick={() => evaluationsSectionRef.current?.openAddEditor()}>
              <Plus className="h-4 w-4" />
              Create Evaluation
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
            <TabsTrigger value="evaluators">Evaluators</TabsTrigger>
          </TabsList>
          <TabsContent value="evaluations">
            <EvaluationsSection
              ref={evaluationsSectionRef}
              initialQueryFilter={queryFilter}
            />
          </TabsContent>
          <TabsContent value="evaluators">
            <EvaluatorsSection ref={evaluatorsSectionRef} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
