'use client';

import { Plus } from 'lucide-react';

import { APIKeyDialogs } from '@/components/api-keys/api-keys-dialogs';
import { APIKeysTable } from '@/components/api-keys/api-keys-table';
import { useAPIKeysManagement } from '@/components/api-keys/use-api-keys-management';
import { Button } from '@/components/ui/button';

export function ApiKeysSettings() {
  const {
    addDialogOpen,
    setAddDialogOpen,
    createdApiKey,
    successDialogOpen,
    setSuccessDialogOpen,
    revokeDialogOpen,
    setRevokeDialogOpen,
    apiKeyToRevoke,
    apiKeys,
    loading,
    error,
    handleApiKeyCreated,
    handleRevoke,
    confirmRevoke,
    deleteAPIKeyMutation,
  } = useAPIKeysManagement();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading API keys...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
        <p className="font-medium">Error loading API keys</p>
        <p className="mt-1 text-sm">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>

      <APIKeysTable
        data={apiKeys}
        onRevoke={handleRevoke}
        onCreate={() => setAddDialogOpen(true)}
      />

      <APIKeyDialogs
        addDialogOpen={addDialogOpen}
        setAddDialogOpen={setAddDialogOpen}
        successDialogOpen={successDialogOpen}
        setSuccessDialogOpen={setSuccessDialogOpen}
        revokeDialogOpen={revokeDialogOpen}
        setRevokeDialogOpen={setRevokeDialogOpen}
        createdApiKey={createdApiKey}
        apiKeyToRevoke={apiKeyToRevoke}
        handleApiKeyCreated={handleApiKeyCreated}
        confirmRevoke={confirmRevoke}
        isRevoking={deleteAPIKeyMutation.isPending}
      />
    </div>
  );
}
