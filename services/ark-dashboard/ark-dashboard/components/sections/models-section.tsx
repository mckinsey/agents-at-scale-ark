'use client';

import { ArrowUpRightIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ModelCard } from '@/components/cards';
import { ModelRow } from '@/components/rows/model-row';
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
import { type Model, modelsService } from '@/lib/services';

interface ModelsSectionProps {
  namespace: string;
}

export const ModelsSection = function ModelsSection({
  namespace,
}: ModelsSectionProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [showCompactView, setShowCompactView] = useState(false);

  const viewOptions: ToggleOption[] = [
    { id: 'compact', label: 'compact view', active: !showCompactView },
    { id: 'card', label: 'card view', active: showCompactView },
  ];

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const modelsData = await modelsService.getAll();
        setModels(modelsData);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('Failed to Load Data', {
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
  }, [namespace]);

  const handleDeleteModel = async (id: string) => {
    try {
      const model = models.find(m => m.id === id);
      if (!model) {
        throw new Error('Model not found');
      }
      await modelsService.deleteById(id);
      toast.success('Model Deleted', {
        description: `Successfully deleted ${model.name}`,
      });
      // Reload data
      const updatedModels = await modelsService.getAll();
      setModels(updatedModels);
    } catch (error) {
      toast.error('Failed to Delete Model', {
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

  if (models.length === 0 && !loading) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.models.icon />
            </EmptyMedia>
            <EmptyTitle>No Models Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t added any models yet. Get started by adding your
              first model.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/models/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Model
              </Button>
            </Link>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm">
            <a
              href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/models/"
              target="_blank">
              Learn More <ArrowUpRightIcon />
            </a>
          </Button>
        </Empty>
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

        <main className="flex-1 overflow-auto px-6 py-0">
          {showCompactView && (
            <div className="grid gap-6 pb-6 md:grid-cols-2 lg:grid-cols-3">
              {models.map(model => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onDelete={handleDeleteModel}
                />
              ))}
            </div>
          )}

          {!showCompactView && (
            <div className="flex flex-col gap-3">
              {models.map(model => (
                <ModelRow
                  key={model.id}
                  model={model}
                  onDelete={handleDeleteModel}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
};
