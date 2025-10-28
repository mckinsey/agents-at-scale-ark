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
import { toast } from 'sonner';

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
import {
  type Model,
  type Secret,
  modelsService,
  secretsService,
} from '@/lib/services';

interface SecretsSectionProps {
  namespace: string;
}

export const SecretsSection = forwardRef<
  { openAddEditor: () => void },
  SecretsSectionProps
>(function SecretsSection({ namespace }, ref) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [secretEditorOpen, setSecretEditorOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);

  const handleOpenAddEditor = useCallback(() => {
    setEditingSecret(null);
    setSecretEditorOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({
    openAddEditor: handleOpenAddEditor,
  }));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [secretsData, modelsData] = await Promise.all([
          secretsService.getAll(),
          modelsService.getAll(),
        ]);
        setSecrets(secretsData);
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

  const handleSaveSecret = async (name: string, password: string) => {
    try {
      // Check if this is an update (secret with this name already exists)
      const existingSecret = secrets.find(s => s.name === name);

      if (existingSecret) {
        await secretsService.update(name, password);
        toast.success('Secret Updated', {
          description: `Successfully updated ${name}`,
        });
      } else {
        await secretsService.create(name, password);
        toast.success('Secret Created', {
          description: `Successfully created ${name}`,
        });
      }
      // Reload data
      const updatedSecrets = await secretsService.getAll();
      setSecrets(updatedSecrets);
    } catch (error) {
      const isUpdate = secrets.some(s => s.name === name);
      toast.error(
        isUpdate ? 'Failed to Update Secret' : 'Failed to Create Secret',
        {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        },
      );
    }
  };

  const handleDeleteSecret = async (id: string) => {
    try {
      const secret = secrets.find(s => s.id === id);
      if (!secret) {
        throw new Error('Secret not found');
      }
      await secretsService.delete(secret.name);
      toast.success('Secret Deleted', {
        description: 'Successfully deleted the secret',
      });
      // Reload data
      const updatedSecrets = await secretsService.getAll();
      setSecrets(updatedSecrets);
    } catch (error) {
      toast.error('Failed to Delete Secret', {
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

  if (secrets.length === 0 && !loading) {
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
        <main className="flex-1 overflow-auto p-6">
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
