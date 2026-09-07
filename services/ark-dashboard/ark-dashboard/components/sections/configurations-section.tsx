'use client';

import { useMemo, useState } from 'react';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Tune } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { ConfigurationsTable } from '@/components/sections/configurations-table';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDelayedLoading } from '@/lib/hooks';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  useDeleteConfiguration,
  useGetAllConfigurations,
} from '@/lib/services/configurations-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

const SKELETON_ROWS = ['first', 'second', 'third', 'fourth', 'fifth'];

function ConfigurationsSkeleton() {
  return (
    <div
      aria-hidden
      className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
      <Skeleton className="h-9 w-[280px]" />
      <div className="flex flex-col gap-4 pt-4">
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex items-center gap-4">
            <Skeleton className="h-5 w-[280px]" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-[240px]" />
            <Skeleton className="h-5 w-[220px]" />
            <Skeleton className="h-5 w-[100px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConfigurationsSection() {
  const { readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: configurations = [], isLoading } = useGetAllConfigurations();
  const deleteConfiguration = useDeleteConfiguration();
  const showLoading = useDelayedLoading(isLoading);

  const filteredConfigurations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return configurations;
    }
    return configurations.filter(configuration =>
      [
        configuration.name,
        configuration.alias ?? '',
        configuration.description ?? '',
        ...configuration.labels,
      ].some(field => field.toLowerCase().includes(query)),
    );
  }, [configurations, searchQuery]);

  const isEmpty = !isLoading && configurations.length === 0;

  const createButton = (
    <NamespacedLink href="/configurations/new">
      <Button disabled={readOnlyMode}>Add configuration</Button>
    </NamespacedLink>
  );

  return (
    <div className="flex h-full w-full content-shell flex-col">
      <ResourcePageHeader
        icon={<Tune className="size-full" />}
        title="Configurations"
        description="Non-secret values that resources read at runtime, such as an endpoint URL per environment"
        actions={!isEmpty && createButton}
      />

      {showLoading && <ConfigurationsSkeleton />}
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
              {createButton}
              <LearnMoreButton href={DOCS_URLS.configurations} />
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
                onEdit={configuration =>
                  push(`/configurations/${configuration.name}`)
                }
                onDelete={name => deleteConfiguration.mutate(name)}
              />
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
