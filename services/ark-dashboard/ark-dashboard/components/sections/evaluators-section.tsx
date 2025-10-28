'use client';

import { ArrowUpRightIcon, Plus } from 'lucide-react';
import type React from 'react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { EvaluatorCard } from '@/components/cards';
import { EvaluatorEditor } from '@/components/editors';
import { EvaluatorRow } from '@/components/rows/evaluator-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { type ToggleOption, ToggleSwitch } from '@/components/ui/toggle-switch';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import {
  type Evaluator,
  type EvaluatorCreateRequest,
  evaluatorsService,
} from '@/lib/services';

export const EvaluatorsSection = forwardRef<{ openAddEditor: () => void }>(
  function EvaluatorsSection(_props, ref) {
    const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
    const [evaluatorEditorOpen, setEvaluatorEditorOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showCompactView, setShowCompactView] = useState(false);
    const showLoading = useDelayedLoading(loading);

    const viewOptions: ToggleOption[] = [
      { id: 'compact', label: 'compact view', active: !showCompactView },
      { id: 'card', label: 'card view', active: showCompactView },
    ];

    useImperativeHandle(ref, () => ({
      openAddEditor: () => setEvaluatorEditorOpen(true),
    }));

    useEffect(() => {
      const loadData = async () => {
        setLoading(true);
        try {
          const evaluatorsData = await evaluatorsService.getAll();
          setEvaluators(evaluatorsData);
        } catch (error) {
          toast.error('Failed to Load Evaluators', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          });
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }, []);

    const handleCreateEvaluator = async (
      evaluator: EvaluatorCreateRequest & { id?: string },
    ) => {
      try {
        const { id: _, ...createData } = evaluator;
        await evaluatorsService.create(createData);
        toast.success('Evaluator Created', {
          description: `Successfully created ${createData.name}`,
        });
        const updatedEvaluators = await evaluatorsService.getAll();
        setEvaluators(updatedEvaluators);
      } catch (error) {
        toast.error('Failed to Create Evaluator', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      }
    };

    const handleDeleteEvaluator = async (name: string) => {
      try {
        const evaluator = evaluators.find(e => e.name === name);
        if (!evaluator) {
          throw new Error('Evaluator not found');
        }
        await evaluatorsService.delete(name);
        toast.success('Evaluator Deleted', {
          description: `Successfully deleted ${evaluator.name}`,
        });
        const updatedEvaluators = await evaluatorsService.getAll();
        setEvaluators(updatedEvaluators);
      } catch (error) {
        toast.error('Failed to Delete Evaluator', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      }
    };

    if (showLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      );
    }

    if (evaluators.length === 0 && !loading) {
      return (
        <>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DASHBOARD_SECTIONS.evaluators.icon />
              </EmptyMedia>
              <EmptyTitle>No Evaluators Yet</EmptyTitle>
              <EmptyDescription>
                You haven&apos;t added any evaluators yet. Get started by adding
                your first evaluator.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setEvaluatorEditorOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Evaluator
              </Button>
            </EmptyContent>
            <Button
              variant="link"
              asChild
              className="text-muted-foreground"
              size="sm">
              <a
                href="https://mckinsey.github.io/agents-at-scale-ark/reference/evaluations/evaluations/"
                target="_blank">
                Learn More <ArrowUpRightIcon />
              </a>
            </Button>
          </Empty>
          <EvaluatorEditor
            open={evaluatorEditorOpen}
            onOpenChange={setEvaluatorEditorOpen}
            evaluator={null}
            onSave={handleCreateEvaluator as any} // eslint-disable-line @typescript-eslint/no-explicit-any
          />
        </>
      );
    }

    return (
      <>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-end px-6 py-3">
            <ToggleSwitch
              options={viewOptions}
              onChange={id => setShowCompactView(id === 'card')}
            />
          </div>

          <main className="flex-1 overflow-auto px-6">
            {showCompactView && (
              <div className="grid gap-6 pb-6 md:grid-cols-2 lg:grid-cols-3">
                {evaluators.map(evaluator => (
                  <EvaluatorCard
                    key={evaluator.name}
                    evaluator={evaluator}
                    onDelete={handleDeleteEvaluator}
                  />
                ))}
              </div>
            )}

            {!showCompactView && (
              <div className="flex flex-col gap-3 pb-6">
                {evaluators.map(evaluator => (
                  <EvaluatorRow
                    key={evaluator.name}
                    evaluator={evaluator}
                    onDelete={handleDeleteEvaluator}
                  />
                ))}
              </div>
            )}
          </main>
        </div>

        <EvaluatorEditor
          open={evaluatorEditorOpen}
          onOpenChange={setEvaluatorEditorOpen}
          evaluator={null}
          onSave={handleCreateEvaluator as any} // eslint-disable-line @typescript-eslint/no-explicit-any
        />
      </>
    );
  },
);
