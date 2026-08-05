'use client';

import { useCallback, useMemo, useState } from 'react';

import { Tune } from '@/components/icons';
import { ConfigurationsTable } from '@/components/sections/configurations-table';
import {
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDelayedLoading } from '@/lib/hooks';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { Configuration } from '@/lib/services/configurations';
import {
  useDeleteConfiguration,
  useGetAllConfigurations,
} from '@/lib/services/configurations-hooks';
import { displayName } from '@/lib/utils/resource-display';
import { useNamespace } from '@/providers/NamespaceProvider';

const LEARN_MORE_URL = 'https://mckinsey.github.io/agents-at-scale-ark/';

export function ConfigurationsSection() {
  const { readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: configurations = [], isLoading } = useGetAllConfigurations();
  const deleteConfiguration = useDeleteConfiguration();

  const showLoading = useDelayedLoading(isLoading);

  const filteredConfigurations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return configurations;
    }
    return configurations.filter(configuration => {
      const haystack = [
        configuration.name,
        configuration.alias ?? '',
        configuration.description ?? '',
        configuration.value ?? '',
        ...(configuration.labels ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [configurations, searchQuery]);

  const handleAdd = useCallback(() => {
    push('/configurations/new');
  }, [push]);

  const handleEdit = useCallback(
    (configuration: Configuration) => {
      push(`/configurations/${encodeURIComponent(configuration.name)}`);
    },
    [push],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const configuration = configurations.find(item => item.id === id);
      if (!configuration) {
        return;
      }
      deleteConfiguration.mutate(configuration.name);
    },
    [configurations, deleteConfiguration],
  );

  const isEmpty = !isLoading && configurations.length === 0;

  return (
    <div className="content-shell flex h-full w-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              <Tune className="size-full" />
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              Configurations
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Create and manage configuration values for agents and services
          </p>
        </div>
        {!isEmpty && (
          <Button onClick={handleAdd} disabled={readOnlyMode}>
            Add configuration
          </Button>
        )}
      </div>

      {showLoading && (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      )}
      {!showLoading && isEmpty && (
        <ResourceEmptyState
          icon={<Tune className="size-full" />}
          title="No configurations yet"
          description={
            <>
              <p className="mb-2">
                You haven&apos;t added any configurations yet.
              </p>
              <p>Get started by adding your first configuration.</p>
            </>
          }
          actions={
            <>
              <Button onClick={handleAdd} disabled={readOnlyMode}>
                Add configuration
              </Button>
              <a href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">Learn more</Button>
              </a>
            </>
          }
        />
      )}
      {!showLoading && !isEmpty && (
        <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
          <div className="flex flex-none items-end gap-3">
            <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>

          {filteredConfigurations.length === 0 ? (
            <ResourceNoResults
              icon={<Tune className="size-full" />}
              message="No configurations match your search."
            />
          ) : (
            <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <ConfigurationsTable
                configurations={filteredConfigurations}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
