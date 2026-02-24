'use client';

import { AddAPIKeyDialog } from '@/components/dialogs/add-api-key-dialog';
import { APIKeyCreatedDialog } from '@/components/dialogs/api-key-created-dialog';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { type APIKey, type APIKeyCreateResponse } from '@/lib/services';

interface APIKeyDialogsProps {
  addDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
  successDialogOpen: boolean;
  setSuccessDialogOpen: (open: boolean) => void;
  revokeDialogOpen: boolean;
  setRevokeDialogOpen: (open: boolean) => void;
  createdApiKey: APIKeyCreateResponse | null;
  apiKeyToRevoke: APIKey | null;
  handleApiKeyCreated: (response: APIKeyCreateResponse) => void;
  confirmRevoke: () => Promise<void>;
  isRevoking: boolean;
}

export function APIKeyDialogs({
  addDialogOpen,
  setAddDialogOpen,
  successDialogOpen,
  setSuccessDialogOpen,
  revokeDialogOpen,
  setRevokeDialogOpen,
  createdApiKey,
  apiKeyToRevoke,
  handleApiKeyCreated,
  confirmRevoke,
  isRevoking,
}: APIKeyDialogsProps) {
  return (
    <>
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
        confirmText={isRevoking ? 'Revoking...' : 'Revoke'}
        cancelText="Cancel"
        onConfirm={confirmRevoke}
        variant="destructive"
      />
    </>
  );
}
