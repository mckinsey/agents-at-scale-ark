'use client';

import { ArrowUpRightIcon, Check, Copy, Plus } from 'lucide-react';
import { useState } from 'react';

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
import { type APIKey } from '@/lib/services';

interface APIKeysTableProps {
  data: APIKey[];
  onRevoke: (apiKey: APIKey) => void;
  onCreate: () => void;
}

export function APIKeysTable({ data, onRevoke, onCreate }: APIKeysTableProps) {
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
