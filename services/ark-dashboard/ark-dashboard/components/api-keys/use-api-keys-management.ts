import { useState } from 'react';

import { type APIKey, type APIKeyCreateResponse } from '@/lib/services';
import { useDeleteAPIKey, useListAPIKeys } from '@/lib/services/api-keys-hooks';

export function useAPIKeysManagement() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] =
    useState<APIKeyCreateResponse | null>(null);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [apiKeyToRevoke, setApiKeyToRevoke] = useState<APIKey | null>(null);

  const { data: apiKeysData, isPending: loading, error } = useListAPIKeys();
  const deleteAPIKeyMutation = useDeleteAPIKey();

  const apiKeys = apiKeysData?.items || [];

  const handleApiKeyCreated = (response: APIKeyCreateResponse) => {
    setCreatedApiKey(response);
    setSuccessDialogOpen(true);
  };

  const handleRevoke = (apiKey: APIKey) => {
    setApiKeyToRevoke(apiKey);
    setRevokeDialogOpen(true);
  };

  const confirmRevoke = async () => {
    if (!apiKeyToRevoke) return;

    await deleteAPIKeyMutation.mutateAsync(apiKeyToRevoke.public_key);
    setRevokeDialogOpen(false);
    setApiKeyToRevoke(null);
  };

  return {
    // State
    addDialogOpen,
    setAddDialogOpen,
    createdApiKey,
    successDialogOpen,
    setSuccessDialogOpen,
    revokeDialogOpen,
    setRevokeDialogOpen,
    apiKeyToRevoke,

    // Data
    apiKeys,
    loading,
    error,

    // Actions
    handleApiKeyCreated,
    handleRevoke,
    confirmRevoke,
    deleteAPIKeyMutation,
  };
}
