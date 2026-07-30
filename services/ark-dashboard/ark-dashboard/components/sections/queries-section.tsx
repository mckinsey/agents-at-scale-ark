'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DatabaseSearch, Info, SwapVert, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import type { components } from '@/lib/api/generated/types';
import { queriesService } from '@/lib/services/queries';
import type { useListQueries } from '@/lib/services/queries-hooks';
import { cn } from '@/lib/utils';
import { formatAge } from '@/lib/utils/time';

type QueryResponse = components['schemas']['QueryResponse'];
type ListQueriesResult = ReturnType<typeof useListQueries>;
type SortDirection = 'asc' | 'desc';

interface QueriesSectionProps {
  readonly searchTerm: string;
  readonly onClearSearch: () => void;
  readonly queryResult: ListQueriesResult;
}

const STATUS_CONFIG: Record<string, { label: string; dotClass: string }> = {
  done: { label: 'Done', dotClass: 'bg-status-success' },
  error: { label: 'Error', dotClass: 'bg-status-error' },
  failed: { label: 'Error', dotClass: 'bg-status-error' },
  running: { label: 'Running', dotClass: 'bg-status-information' },
  provisioning: { label: 'Provisioning', dotClass: 'bg-status-warning' },
  queued: { label: 'Queued', dotClass: 'bg-status-warning' },
  canceled: { label: 'Canceled', dotClass: 'bg-fg-tertiary' },
};

function getInputDisplayText(
  input: string | { role: string; content?: unknown }[] | undefined,
): string {
  if (!input) return '—';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    const lastMsg = input.at(-1);
    if (!lastMsg?.content) return '—';
    return typeof lastMsg.content === 'string'
      ? lastMsg.content
      : JSON.stringify(lastMsg.content);
  }
  return '—';
}

function formatTokenUsage(query: QueryResponse): string {
  const usage = (query.status as { tokenUsage?: unknown })?.tokenUsage as
    | { promptTokens?: number; completionTokens?: number; cachedTokens?: number }
    | undefined;
  if (!usage) return '—';
  const cached = usage.cachedTokens || 0;
  const newInput = Math.max(0, (usage.promptTokens || 0) - cached);
  const base = `${newInput} / ${usage.completionTokens || 0}`;
  return cached > 0 ? `${base} (${cached} cached)` : base;
}

function getTargetDisplay(query: QueryResponse): string {
  const response = (query.status as { response?: unknown })?.response as
    | { target?: { name: string; type: string } }
    | undefined;
  const target = response?.target;
  if (!target?.type || !target?.name) return '—';
  return `${target.type}:${target.name}`;
}

function getOutputText(query: QueryResponse): string {
  const response = (query.status as { response?: unknown })?.response as
    | { content?: string }
    | undefined;
  return response?.content || '—';
}

function getPhase(query: QueryResponse): string | undefined {
  return (query.status as { phase?: string })?.phase;
}

function QueryStatus({
  phase,
  onCancel,
}: Readonly<{ phase: string | undefined; onCancel?: () => void }>) {
  if (!phase) return <span className="text-fg-secondary">—</span>;
  const normalized = phase.toLowerCase();
  const config = STATUS_CONFIG[normalized] ?? {
    label: phase,
    dotClass: 'bg-fg-tertiary',
  };
  return (
    <span className="group/status inline-flex items-center gap-2">
      <span className={cn('size-2 shrink-0 rounded-full', config.dotClass)} />
      <span className="label-regular-primary text-fg-primary">
        {config.label}
      </span>
      {normalized === 'running' && onCancel && (
        <button
          type="button"
          aria-label="Cancel running query"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
          className="text-fg-secondary hover:text-fg-primary ml-1 hidden text-sm underline underline-offset-2 transition-colors group-hover/status:inline">
          Cancel
        </button>
      )}
    </span>
  );
}

function HeaderInfo({ tooltip }: Readonly<{ tooltip: string }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <IconShell size="sm" variant="secondary">
            <Info />
          </IconShell>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface QueryRowProps {
  readonly query: QueryResponse;
  readonly onDelete: (name: string) => void;
  readonly onCancel: (name: string) => void;
}

function QueryRow({ query, onDelete, onCancel }: Readonly<QueryRowProps>) {
  const href = `/query/${encodeURIComponent(query.name)}`;
  const target = getTargetDisplay(query);
  const input = getInputDisplayText(query.input);
  const output = getOutputText(query);

  return (
    <TableRow className="relative isolate cursor-pointer transition-colors">
      <TableCell size="small" className="w-[110px]">
        {formatAge(query.creationTimestamp)}
      </TableCell>

      <TableCell size="small" className="w-[200px]">
        <span aria-hidden className={rowHoverOverlayClass} />
        <NamespacedLink
          href={href}
          title={query.name}
          className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
          {query.name}
        </NamespacedLink>
      </TableCell>

      <TableCell size="small" className="relative z-10 w-[160px]">
        <TruncatedTooltip label={target}>
          <NamespacedLink
            href={href}
            tabIndex={-1}
            className="text-fg-primary block w-full truncate">
            {target}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="relative z-10">
        <TruncatedTooltip label={input}>
          <NamespacedLink
            href={href}
            tabIndex={-1}
            className="text-fg-primary block w-full truncate">
            {input}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="relative z-10">
        <TruncatedTooltip label={output}>
          <NamespacedLink
            href={href}
            tabIndex={-1}
            className="text-fg-primary block w-full truncate">
            {output}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="w-[140px]">
        {formatTokenUsage(query)}
      </TableCell>

      <TableCell size="small" className="relative z-10 w-[120px]">
        <QueryStatus
          phase={getPhase(query)}
          onCancel={() => onCancel(query.name)}
        />
      </TableCell>

      <TableCell size="small" className="relative z-10 w-[72px]">
        <div className="flex items-center justify-center">
          <IconActionButton
            label="Delete query"
            onClick={() => onDelete(query.name)}>
            <Trash />
          </IconActionButton>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function QueriesSection({
  searchTerm,
  onClearSearch,
  queryResult,
}: Readonly<QueriesSectionProps>) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, isError, error, refetch } = queryResult;

  useEffect(() => {
    if (isError) {
      toast.error('Failed to Load Queries', {
        description:
          error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }, [isError, error]);

  const queries = data?.items ?? [];
  const total = data?.total ?? 0;

  const sortedQueries = [...queries].sort((a, b) => {
    const aTime = a.creationTimestamp
      ? new Date(a.creationTimestamp).getTime()
      : 0;
    const bTime = b.creationTimestamp
      ? new Date(b.creationTimestamp).getTime()
      : 0;
    return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
  });

  const handleDelete = async (queryName: string) => {
    try {
      await queriesService.delete(queryName);
      toast.success('Query Deleted', {
        description: 'Successfully deleted query',
      });
      refetch();
    } catch (err) {
      toast.error('Failed to Delete Query', {
        description:
          err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    }
  };

  const handleCancel = async (queryName: string) => {
    try {
      await queriesService.cancel(queryName);
      toast.success('Query Canceled', {
        description: 'Successfully canceled query',
      });
      refetch();
    } catch (err) {
      toast.error('Failed to Cancel Query', {
        description:
          err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="text-fg-secondary">Loading...</div>
      </div>
    );
  }

  if (searchTerm && total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
        <div className="bg-surface-secondary flex items-center p-3">
          <IconShell size="default" variant="secondary">
            <DatabaseSearch />
          </IconShell>
        </div>
        <p className="text-fg-secondary text-base leading-6 tracking-[-0.128px]">
          No queries match &ldquo;{searchTerm}&rdquo;.
        </p>
        <Button variant="outline" onClick={onClearSearch}>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
        <TableHeader>
          <TableRow>
            <TableHead size="small" className="w-[110px]">
              <button
                type="button"
                onClick={() =>
                  setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))
                }
                className="inline-flex items-center gap-1">
                Added
                <IconShell size="sm" variant="secondary">
                  <SwapVert />
                </IconShell>
              </button>
            </TableHead>
            <TableHead size="small" className="w-[200px]">
              Name
            </TableHead>
            <TableHead size="small" className="w-[160px]">
              Target
            </TableHead>
            <TableHead size="small">Input</TableHead>
            <TableHead size="small">
              <span className="inline-flex items-center gap-1">
                Output
                <HeaderInfo tooltip="Content format. To see Raw format go to the query details page" />
              </span>
            </TableHead>
            <TableHead size="small" className="w-[140px]">
              <span className="inline-flex items-center gap-1">
                Token usage
                <HeaderInfo tooltip="Input / completion" />
              </span>
            </TableHead>
            <TableHead size="small" className="w-[120px]">
              Status
            </TableHead>
            <TableHead size="small" className="w-[72px]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedQueries.map(query => (
            <QueryRow
              key={query.name}
              query={query}
              onDelete={handleDelete}
              onCancel={handleCancel}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
