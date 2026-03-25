'use client';

import { ArrowUpRightIcon, Plus } from 'lucide-react';
import type React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

import { SecretEditor } from '@/components/editors';
import { SecretRow } from '@/components/rows/secret-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import { type Model, modelsService } from '@/lib/services';
import {
  useCreateSecret,
  useDeleteSecret,
  useGetAllSecrets,
  useUpdateSecret,
} from '@/lib/services/secrets-hooks';
import type { Secret } from '@/lib/services/secrets';

interface SecretsSectionProps {
  namespace: string;
}

export const SecretsSection = forwardRef<
  { openAddEditor: () => void },
  SecretsSectionProps
>(function SecretsSection({ namespace }, ref) {
  const [models, setModels] = useState<Model[]>([]);
  const [secretEditorOpen, setSecretEditorOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);

  // Use React Query hooks
  const {
    data: secrets = [],
    isLoading: secretsLoading,
    error: secretsError,
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

  const handleOpenAddEditor = useCallback(() => {
    setEditingSecret(null);
    setSecretEditorOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({
    openAddEditor: handleOpenAddEditor,
  }));

  useEffect(() => {
    const loadModels = async () => {
      try {
        const modelsData = await modelsService.getAll();
        setModels(modelsData);
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };

    loadModels();
  }, [namespace]);

  const handleSaveSecret = (name: string, password: string) => {
    // Check if this is an update (secret with this name already exists)
    const existingSecret = secrets.find(s => s.name === name);

    if (existingSecret) {
      // Use the update mutation hook
      updateSecretMutation.mutate({ name, password });
    } else {
      // Use the create mutation hook
      createSecretMutation.mutate({ name, password });
    }
  };

  const handleDeleteSecret = (id: string) => {
    const secret = secrets.find(s => s.id === id);
    if (!secret) {
      return;
    }

    // Use the delete mutation hook
    deleteSecretMutation.mutate(secret.name);
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (secrets.length === 0 && !secretsLoading) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.secrets.icon />
            </EmptyMedia>
            <EmptyTitle>No Secrets Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t added any secrets yet. Get started by adding your
              first secret.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={handleOpenAddEditor}>
              <Plus className="h-4 w-4" />
              Add Secret
            </Button>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm">
            <a
              href="https://mckinsey.github.io/agents-at-scale-ark/"
              target="_blank">
              Learn More <ArrowUpRightIcon />
            </a>
          </Button>
        </Empty>
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
      </>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex-1" />
          <Button onClick={handleOpenAddEditor} variant="default">
            <Plus className="mr-2 h-4 w-4" />
            Add Secret
          </Button>
        </div>
        <main className="mt-3 flex-1 overflow-auto">
          <div className="flex flex-row flex-wrap gap-2 pb-6">
            {secrets.map(secret => (
              <SecretRow
                key={secret.id}
                secret={secret}
                models={models}
                onEdit={secretToEdit => {
                  setEditingSecret(secretToEdit);
                  setSecretEditorOpen(true);
                }}
                onDelete={handleDeleteSecret}
              />
            ))}
          </div>
        </main>
      </div>

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
    </>
  );
});
