'use client';

import { useCallback } from 'react';

import { APIKeyDialogs } from '@/components/api-keys/api-keys-dialogs';
import { APIKeysTable } from '@/components/api-keys/api-keys-table';
import { useAPIKeysManagement } from '@/components/api-keys/use-api-keys-management';
import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { VpnKey } from '@/components/icons';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceErrorState,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDelayedLoading } from '@/lib/hooks';

const SKELETON_ROWS = [1, 2, 3, 4, 5];

function APIKeysSkeleton() {
  return (
    <div
      className="mt-5 flex flex-col gap-1"
      aria-busy="true"
      aria-label="Loading API keys">
      {SKELETON_ROWS.map(row => (
        <Skeleton key={row} className="h-[60px] w-full" />
      ))}
    </div>
  );
}

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

  const showLoading = useDelayedLoading(loading);
  const isEmpty = !loading && !error && apiKeys.length === 0;
  const showTable = !loading && !error && !isEmpty;
  // Also shown in the error state, so a failed load still offers an action.
  const showHeaderAction = !loading && !isEmpty;

  const openAddDialog = useCallback(
    () => setAddDialogOpen(true),
    [setAddDialogOpen],
  );

  return (
    <div className="content-shell flex h-full w-full flex-col">
      <ResourcePageHeader
        icon={<VpnKey className="size-full" />}
        title={showTable ? `API keys (${apiKeys.length})` : 'API keys'}
        description="Create and manage API keys for secure platform access"
        actions={
          showHeaderAction ? (
            <Button onClick={openAddDialog}>Create API Key</Button>
          ) : undefined
        }
      />

      {showLoading && <APIKeysSkeleton />}

      {!loading && error && (
        <ResourceErrorState
          className="mt-5"
          title="Couldn't load API keys"
          description={error instanceof Error ? error.message : String(error)}
        />
      )}

      {isEmpty && (
        <ResourceEmptyState
          icon={<VpnKey className="size-full" />}
          title="No API Key yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t added any key yet.</p>
              <p>Get started to see API keys.</p>
            </>
          }
          actions={
            <>
              <LearnMoreButton href={DOCS_URLS.apiKeys} />
              <Button onClick={openAddDialog}>Create</Button>
            </>
          }
        />
      )}

      {showTable && (
        <div className="mt-5 min-h-0 flex-1 overflow-auto">
          <APIKeysTable data={apiKeys} onRevoke={handleRevoke} />
        </div>
      )}

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
