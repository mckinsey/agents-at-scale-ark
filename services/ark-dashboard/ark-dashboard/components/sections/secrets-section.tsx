'use client';

import { useEffect, useMemo, useState } from 'react';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Shield } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { SecretsTable } from '@/components/sections/secrets-table';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDelayedLoading } from '@/lib/hooks';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { type Model, modelsService } from '@/lib/services';
import { useDeleteSecret, useGetAllSecrets } from '@/lib/services/secrets-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

export function SecretsSection() {
  const { readOnlyMode, namespace } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [models, setModels] = useState<Model[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: secrets = [], isLoading: secretsLoading } = useGetAllSecrets();
  const deleteSecretMutation = useDeleteSecret();
  const showLoading = useDelayedLoading(secretsLoading);

  useEffect(() => {
    const loadModels = async () => {
      try {
        setModels(await modelsService.getAll(namespace));
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };

    loadModels();
  }, [namespace]);

  const filteredSecrets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return secrets;
    }
    return secrets.filter(secret => secret.name.toLowerCase().includes(q));
  }, [secrets, searchQuery]);

  const handleDeleteSecret = (id: string) => {
    const secret = secrets.find(s => s.id === id);
    if (!secret) {
      return;
    }
    deleteSecretMutation.mutate(secret.name);
  };

  const isEmpty = !secretsLoading && secrets.length === 0;

  const createButton = (
    <NamespacedLink href="/secrets/new">
      <Button disabled={readOnlyMode}>Add secret</Button>
    </NamespacedLink>
  );

  return (
    <div className="flex h-full w-full content-shell flex-col">
      <ResourcePageHeader
        icon={<Shield className="size-full" />}
        title="Secrets"
        description="Create and manage secrets for models and services"
        actions={!isEmpty && createButton}
      />

      {showLoading && (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      )}
      {!showLoading && isEmpty && (
        <ResourceEmptyState
          icon={<Shield className="size-full" />}
          title="No secrets yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t added any secrets yet.</p>
              <p>Get started by adding your first secret.</p>
            </>
          }
          actions={
            <>
              {createButton}
              <LearnMoreButton href={DOCS_URLS.root} />
            </>
          }
        />
      )}
      {!showLoading && !isEmpty && (
        <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
          <div className="flex flex-none items-end gap-3">
            <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>

          {filteredSecrets.length === 0 ? (
            <ResourceNoResults
              icon={<Shield className="size-full" />}
              message="No secrets match your search."
            />
          ) : (
            <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <SecretsTable
                secrets={filteredSecrets}
                models={models}
                onEdit={secret => push(`/secrets/${secret.name}`)}
                onDelete={handleDeleteSecret}
              />
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
