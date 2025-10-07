"use client";

import type React from "react";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { toast } from "@/components/ui/use-toast";
import { SecretEditor } from "@/components/editors";
import {
  secretsService,
  modelsService,
  type Secret,
  type Model
} from "@/lib/services";
import { SecretRow } from "@/components/rows/secret-row";
import { useDelayedLoading } from "@/lib/hooks";

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

  useImperativeHandle(ref, () => ({
    openAddEditor: () => {
      setEditingSecret(null);
      setSecretEditorOpen(true);
    }
  }));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [secretsData, modelsData] = await Promise.all([
          secretsService.getAll(),
          modelsService.getAll()
        ]);
        setSecrets(secretsData);
        setModels(modelsData);
      } catch (error) {
        console.error("Failed to load data:", error);
        toast({
          variant: "destructive",
          title: "Failed to Load Data",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
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
      const existingSecret = secrets.find((s) => s.name === name);

      if (existingSecret) {
        await secretsService.update(name, password);
        toast({
          variant: "success",
          title: "Secret Updated",
          description: `Successfully updated ${name}`
        });
      } else {
        await secretsService.create(name, password);
        toast({
          variant: "success",
          title: "Secret Created",
          description: `Successfully created ${name}`
        });
      }
      // Reload data
      const updatedSecrets = await secretsService.getAll();
      setSecrets(updatedSecrets);
    } catch (error) {
      const isUpdate = secrets.some((s) => s.name === name);
      toast({
        variant: "destructive",
        title: isUpdate ? "Failed to Update Secret" : "Failed to Create Secret",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  const handleDeleteSecret = async (id: string) => {
    try {
      const secret = secrets.find((s) => s.id === id);
      if (!secret) {
        throw new Error("Secret not found");
      }
      await secretsService.delete(secret.name);
      toast({
        variant: "success",
        title: "Secret Deleted",
        description: "Successfully deleted the secret"
      });
      // Reload data
      const updatedSecrets = await secretsService.getAll();
      setSecrets(updatedSecrets);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Delete Secret",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center py-8">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <main className="flex-1 overflow-auto p-6">
          <div className="flex flex-row flex-wrap gap-2 pb-6">
            {secrets.map((secret) => (
              <SecretRow
                key={secret.id}
                secret={secret}
                models={models}
                onEdit={(secret) => {
                  setEditingSecret(secret);
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
        onOpenChange={(open) => {
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
