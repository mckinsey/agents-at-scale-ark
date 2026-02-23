import { Plus } from 'lucide-react';

import { APIKeysTable } from '@/components/api-keys/api-keys-table';
import { useAPIKeysManagement } from '@/components/api-keys/use-api-keys-management';
import { PageHeader } from '@/components/common/page-header';
import { AddAPIKeyDialog } from '@/components/dialogs/add-api-key-dialog';
import { APIKeyCreatedDialog } from '@/components/dialogs/api-key-created-dialog';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';

export function ApiKeysSection() {
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
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="py-8 text-center">Loading API keys...</div>
          </main>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
              <p className="font-medium">Error loading API keys</p>
              <p className="mt-1 text-sm">
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create API Key
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <h1 className="mb-4 px-2 text-3xl font-bold">Service API Keys</h1>
          <APIKeysTable
            data={apiKeys}
            onRevoke={handleRevoke}
            onCreate={() => setAddDialogOpen(true)}
          />
        </main>
      </div>

      <AddAPIKeyDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleApiKeyCreated}
      />

      {createdApiKey && (
        <APIKeyCreatedDialog
          open={successDialogOpen}
          onOpenChange={setSuccessDialogOpen}
          apiKey={createdApiKey}
        />
      )}

      <ConfirmationDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title="Revoke API Key"
        description={
          apiKeyToRevoke
            ? `Revoke API key "${apiKeyToRevoke.name}" (${apiKeyToRevoke.public_key})? This action cannot be undone and will immediately invalidate the key.`
            : ''
        }
        confirmText={deleteAPIKeyMutation.isPending ? 'Revoking...' : 'Revoke'}
        cancelText="Cancel"
        onConfirm={confirmRevoke}
        variant="destructive"
      />
    </>
  );
}
