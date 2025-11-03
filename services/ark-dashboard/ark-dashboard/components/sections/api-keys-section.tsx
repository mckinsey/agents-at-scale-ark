import { ArrowUpRightIcon, Check, Copy, Plus } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { AddAPIKeyDialog } from '@/components/dialogs/add-api-key-dialog';
import { APIKeyCreatedDialog } from '@/components/dialogs/api-key-created-dialog';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { type APIKey, type APIKeyCreateResponse } from '@/lib/services';
import { useDeleteAPIKey, useListAPIKeys } from '@/lib/services/api-keys-hooks';

function DataTable({
  data,
  onRevoke,
  onCreate,
}: {
  data: APIKey[];
  onRevoke: (apiKey: APIKey) => void;
  onCreate: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const Icon = DASHBOARD_SECTIONS['api-keys'].icon;

  const copyToClipboard = async (text: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Public Key</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map(apiKey => (
              <TableRow key={apiKey.id}>
                <TableCell className="font-medium">{apiKey.name}</TableCell>
                <TableCell className="font-mono text-sm">
                  <div className="flex items-center gap-2">
                    <span>{apiKey.public_key.substring(0, 20)}...</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              copyToClipboard(apiKey.public_key, apiKey.id)
                            }>
                            {copiedKey === apiKey.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {copiedKey === apiKey.id
                            ? 'Copied!'
                            : 'Copy public key'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
                <TableCell>
                  {new Date(apiKey.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  {apiKey.last_used_at
                    ? new Date(apiKey.last_used_at).toLocaleString()
                    : 'Never'}
                </TableCell>
                <TableCell>
                  {apiKey.expires_at
                    ? new Date(apiKey.expires_at).toLocaleString()
                    : 'Never'}
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRevoke(apiKey)}>
                          Revoke
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Revoke and invalidate this API key
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Icon />
                    </EmptyMedia>
                    <EmptyTitle>No API Keys Yet</EmptyTitle>
                    <EmptyDescription>
                      You haven&apos;t created any API Keys yet. Get started by
                      creating your first API Key.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={onCreate}>
                      <Plus className="h-4 w-4" />
                      Create API Key
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
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function ApiKeysSection() {
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

  if (loading) {
    return (
      <>
        <PageHeader currentPage="Service API Keys" />
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
        <PageHeader currentPage="Service API Keys" />
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
        currentPage="Service API Keys"
        actions={
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create API Key
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <DataTable
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
