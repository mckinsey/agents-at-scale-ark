'use client';

import { useEffect, useMemo, useState } from 'react';

import { SecretEditor } from '@/components/editors';
import { Shield } from '@/components/icons';
import {
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { SecretsTable } from '@/components/sections/secrets-table';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDelayedLoading } from '@/lib/hooks';
import { type Model, modelsService } from '@/lib/services';
import {
  useCreateSecret,
  useDeleteSecret,
  useGetAllSecrets,
  useUpdateSecret,
} from '@/lib/services/secrets-hooks';
import type { Secret } from '@/lib/services/secrets';
import { useNamespace } from '@/providers/NamespaceProvider';

const LEARN_MORE_URL = 'https://mckinsey.github.io/agents-at-scale-ark/';

export function SecretsSection() {
  const { readOnlyMode, namespace } = useNamespace();
  const [models, setModels] = useState<Model[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [secretEditorOpen, setSecretEditorOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);

  const {
    data: secrets = [],
    isLoading: secretsLoading,
  } = useGetAllSecrets();

  const createSecretMutation = useCreateSecret({
    onSuccess: () => {
      setSecretEditorOpen(false);
      setEditingSecret(null);
    },
  });

  const updateSecretMutation = useUpdateSecret({
    onSuccess: () => {
      setSecretEditorOpen(false);
      setEditingSecret(null);
    },
  });

  const deleteSecretMutation = useDeleteSecret();

  const showLoading = useDelayedLoading(secretsLoading);

  useEffect(() => {
    const loadModels = async () => {
      try {
        setModels(await modelsService.getAll());
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

  const handleOpenAddEditor = () => {
    setEditingSecret(null);
    setSecretEditorOpen(true);
  };

  const handleSaveSecret = (name: string, password: string) => {
    const existingSecret = secrets.find(s => s.name === name);
    if (existingSecret) {
      updateSecretMutation.mutate({ name, password });
    } else {
      createSecretMutation.mutate({ name, password });
    }
  };

  const handleDeleteSecret = (id: string) => {
    const secret = secrets.find(s => s.id === id);
    if (!secret) {
      return;
    }
    deleteSecretMutation.mutate(secret.name);
  };

  const isEmpty = !secretsLoading && secrets.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <IconShell size="default" variant="primary">
            <Shield className="size-full" />
          </IconShell>
          <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
            Secrets
          </h1>
        </div>
        <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
          Create and manage secrets for models and services
        </p>
      </div>

      {showLoading ? (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      ) : isEmpty ? (
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
              <Button onClick={handleOpenAddEditor} disabled={readOnlyMode}>
                Add secret
              </Button>
              <a href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">Learn more</Button>
              </a>
            </>
          }
        />
      ) : (
        <div className="mx-auto mt-5 flex min-h-0 w-full max-w-[1344px] flex-1 flex-col gap-2">
          <div className="flex flex-none items-end justify-between gap-3">
            <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
            <Button onClick={handleOpenAddEditor} disabled={readOnlyMode}>
              Add secret
            </Button>
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
                onEdit={secretToEdit => {
                  setEditingSecret(secretToEdit);
                  setSecretEditorOpen(true);
                }}
                onDelete={handleDeleteSecret}
              />
            </ScrollArea>
          )}
        </div>
      )}

      <SecretEditor
        open={secretEditorOpen}
        onOpenChange={open => {
          setSecretEditorOpen(open);
          if (!open) {
            setEditingSecret(null);
          }
        }}
        secret={editingSecret}
        onSave={handleSaveSecret}
        existingSecrets={secrets}
      />
    </div>
  );
}
