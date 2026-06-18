'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import {
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDelayedLoading } from '@/lib/hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

type StatusFilter = 'All' | 'True' | 'False';

const STATUS_ITEMS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'True', label: 'Active' },
  { value: 'False', label: 'Error' },
];

export interface ResourceListItem {
  id: string;
  name: string;
  description?: string | null;
  available?: string | null;
}

interface ResourceListSectionProps<T extends ResourceListItem> {
  /** Raw icon element (e.g. <Group />); wrapped in IconShell internally. */
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly createHref: string;
  readonly createLabel: string;
  readonly learnMoreUrl: string;
  /** Capitalised singular for toasts, e.g. "Team" or "Agent". */
  readonly entityLabel: string;
  /** Lowercase plural for filter messages, e.g. "agents" or "MCP servers". */
  readonly entityPluralLabel?: string;
  readonly emptyTitle: string;
  readonly emptyDescription: ReactNode;
  readonly headerActions?: ReactNode;
  readonly loadItems: () => Promise<T[]>;
  readonly deleteItem: (id: string) => Promise<unknown>;
  readonly renderTable: (
    items: T[],
    onDelete: (id: string) => void,
  ) => ReactNode;
}

export function ResourceListSection<T extends ResourceListItem>({
  icon,
  title,
  subtitle,
  createHref,
  createLabel,
  learnMoreUrl,
  entityLabel,
  entityPluralLabel,
  emptyTitle,
  emptyDescription,
  headerActions,
  loadItems,
  deleteItem,
  renderTable,
}: ResourceListSectionProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const showLoading = useDelayedLoading(loading);
  const { readOnlyMode, namespace } = useNamespace();

  const loadItemsRef = useRef(loadItems);
  loadItemsRef.current = loadItems;

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false);
      const matchesStatus =
        statusFilter === 'All' ||
        (item.available ?? 'Unknown') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [items, searchQuery, statusFilter]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setItems(await loadItemsRef.current());
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

    load();
  }, [namespace]);

  const handleDelete = async (id: string) => {
    try {
      const item = items.find(i => i.id === id);
      if (!item) {
        throw new Error(`${entityLabel} not found`);
      }
      await deleteItem(id);
      toast.success(`${entityLabel} Deleted`, {
        description: `Successfully deleted ${item.name}`,
      });
      setLoading(true);
      try {
        setItems(await loadItemsRef.current());
      } finally {
        setLoading(false);
      }
    } catch (error) {
      toast.error(`Failed to Delete ${entityLabel}`, {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const isEmpty = !loading && items.length === 0;

  const pluralLabel = entityPluralLabel ?? `${entityLabel.toLowerCase()}s`;
  const statusLabel = STATUS_ITEMS.find(s => s.value === statusFilter)?.label;
  const noResultsMessage =
    statusFilter === 'All'
      ? `No ${pluralLabel} match your search.`
      : `There are no ${statusLabel} ${pluralLabel} at the moment.`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              {icon}
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              {title}
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            {subtitle}
          </p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-3">
            {headerActions}
            {readOnlyMode ? (
              <Button disabled>{createLabel}</Button>
            ) : (
              <NamespacedLink href={createHref}>
                <Button>{createLabel}</Button>
              </NamespacedLink>
            )}
          </div>
        )}
      </div>

      {showLoading ? (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      ) : isEmpty ? (
        <ResourceEmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          actions={
            <>
              {readOnlyMode ? (
                <Button disabled>{createLabel}</Button>
              ) : (
                <NamespacedLink href={createHref}>
                  <Button>{createLabel}</Button>
                </NamespacedLink>
              )}
              <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">Learn more</Button>
              </a>
            </>
          }
        />
      ) : (
        <div className="mx-auto mt-5 flex min-h-0 w-full max-w-[1344px] flex-1 flex-col gap-2">
          <div className="flex flex-none items-end gap-3">
            <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
            <div className="flex w-48 flex-col gap-2">
              <span className="text-fg-secondary text-sm leading-5 tracking-[-0.112px]">
                Status
              </span>
              <Select
                items={STATUS_ITEMS}
                value={statusFilter}
                onValueChange={v => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ITEMS.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      <SelectItemText>{item.label}</SelectItemText>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <ResourceNoResults icon={icon} message={noResultsMessage} />
          ) : (
            <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
              {renderTable(filteredItems, handleDelete)}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
