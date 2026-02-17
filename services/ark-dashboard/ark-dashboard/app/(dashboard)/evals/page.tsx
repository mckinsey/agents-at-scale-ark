'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { EvaluationsSection, EvaluatorsSection } from '@/components/sections';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function EvalsPage() {
  const searchParams = useSearchParams();
  const queryFilter = searchParams.get('query');
  const [activeTab, setActiveTab] = useState('evaluations');
  const evaluationsSectionRef = useRef<{ openAddEditor: () => void }>(null);
  const evaluatorsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Evals"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => evaluatorsSectionRef.current?.openAddEditor()}
              variant="ghost"
              className="flex border-1 border-white text-white">
              Add Evaluator
            </Button>
            <Button
              onClick={() => evaluationsSectionRef.current?.openAddEditor()}>
              Create Evaluation
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-xl">Evals</h1>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border-border w-full justify-start border-b bg-transparent">
            <TabsTrigger
              value="evaluations"
              className="flex-none cursor-pointer border-0 !bg-transparent text-lg shadow-none data-[state=active]:rounded-none data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:!border-white data-[state=active]:!bg-transparent data-[state=active]:shadow-none">
              Evaluations
            </TabsTrigger>
            <TabsTrigger
              value="evaluators"
              className="flex-none cursor-pointer border-0 !bg-transparent text-lg shadow-none data-[state=active]:rounded-none data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:!border-white data-[state=active]:!bg-transparent data-[state=active]:shadow-none">
              Evaluators
            </TabsTrigger>
          </TabsList>
          <div className={activeTab === 'evaluations' ? 'block' : 'hidden'}>
            <EvaluationsSection
              ref={evaluationsSectionRef}
              initialQueryFilter={queryFilter}
            />
          </div>
          <div className={activeTab === 'evaluators' ? 'block' : 'hidden'}>
            <EvaluatorsSection ref={evaluatorsSectionRef} />
          </div>
        </Tabs>
      </div>
    </>
  );
}
