'use client';

import { Cog } from 'lucide-react';
import { toast } from 'sonner';

import { ExecutionEngineCard } from '@/components/cards';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  useDeleteExecutionEngine,
  useGetAllExecutionEngines,
} from '@/lib/services/engines-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

export function ExecutionEnginesSection() {
  const { readOnlyMode } = useNamespace();
  const { data: engines, isLoading } = useGetAllExecutionEngines();
  const deleteEngine = useDeleteExecutionEngine();

  const handleDelete = (name: string) => {
    if (readOnlyMode) return;
    deleteEngine.mutate(name);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (!engines || engines.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Cog />
          </EmptyMedia>
          <EmptyTitle>No Execution Engines</EmptyTitle>
          <EmptyDescription>
            No execution engines found in this namespace. Use kubectl to create
            one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="mt-4 flex-1 overflow-auto">
        <div className="grid gap-6 pb-6 md:grid-cols-2 lg:grid-cols-3">
          {engines.map(engine => (
            <ExecutionEngineCard
              key={engine.name}
              engine={engine}
              onDelete={readOnlyMode ? undefined : handleDelete}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
