'use client';

import type { ComponentType, SVGProps } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import {
  AccountTree,
  DatabaseSearch,
  Dns,
  Group,
  Memory,
  PlugConnect,
  SaveAlt,
  SmartToy,
} from '@/components/icons';
import {
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { TagToggle } from '@/components/ui/tag-toggle';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { useDelayedLoading } from '@/lib/hooks';
import type {
  ExportItem,
  ResourceExportData,
  ResourceType,
} from '@/lib/services/export';
import { exportService } from '@/lib/services/export';
import { useNamespace } from '@/providers/NamespaceProvider';

type TabValue = ResourceType | 'all';

type ExportAction = 'selected' | 'all';

interface ResourceMeta {
  readonly type: ResourceType;
  readonly label: string;
  readonly typeLabel: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const RESOURCES: readonly ResourceMeta[] = [
  { type: 'agents', label: 'Agents', typeLabel: 'Agent', icon: SmartToy },
  { type: 'teams', label: 'Teams', typeLabel: 'Team', icon: Group },
  { type: 'models', label: 'Models', typeLabel: 'Model', icon: Memory },
  {
    type: 'queries',
    label: 'Queries',
    typeLabel: 'Query',
    icon: DatabaseSearch,
  },
  { type: 'a2a', label: 'A2A Servers', typeLabel: 'A2A Server', icon: Dns },
  {
    type: 'mcpservers',
    label: 'MCP Servers',
    typeLabel: 'MCP Server',
    icon: PlugConnect,
  },
  {
    type: 'workflows',
    label: 'Workflows',
    typeLabel: 'Workflow',
    icon: AccountTree,
  },
];

const TAG_CLASSES =
  'h-8 !px-2 bg-surface-bg-secondary text-fg-secondary ' +
  'data-[state=on]:bg-fill-muted data-[state=on]:text-fg-primary ' +
  'data-[state=on]:focus-visible:bg-fill-muted';

const COL = {
  select: 'w-12',
  name: 'w-[240px]',
  type: 'w-[160px]',
} as const;

interface ExportRow {
  readonly meta: ResourceMeta;
  readonly item: ExportItem;
}

function rowKey(row: ExportRow): string {
  return `${row.meta.type}:${row.item.id}`;
}

interface ExportTableRowProps {
  readonly row: ExportRow;
  readonly selected: boolean;
  readonly onToggle: (selected: boolean) => void;
}

function ExportTableRow({
  row,
  selected,
  onToggle,
}: Readonly<ExportTableRowProps>) {
  const { meta, item } = row;
  const Icon = meta.icon;

  return (
    <TableRow
      selected={selected}
      className="relative isolate cursor-pointer transition-colors"
      onClick={() => onToggle(!selected)}>
      <TableCell size="small" className={COL.select}>
        <span aria-hidden className={rowHoverOverlayClass} />
        <Checkbox
          checked={selected}
          onCheckedChange={checked => onToggle(checked === true)}
          onClick={event => event.stopPropagation()}
          aria-label={`Select ${item.name}`}
        />
      </TableCell>
      <TableCell size="small" className={COL.name}>
        <TruncatedTooltip label={item.name}>
          <span className="text-fg-primary block truncate">{item.name}</span>
        </TruncatedTooltip>
      </TableCell>
      <TableCell size="small">
        {item.description ? (
          <TruncatedTooltip label={item.description}>
            <span className="text-fg-primary block truncate">
              {item.description}
            </span>
          </TruncatedTooltip>
        ) : (
          <span className="text-fg-tertiary">—</span>
        )}
      </TableCell>
      <TableCell size="small" className={COL.type}>
        <Tag
          variant="primary"
          size="sm"
          className="max-w-full gap-1 hover:no-underline">
          <IconShell size="sm" variant="primary">
            <Icon />
          </IconShell>
          <span className="truncate">{meta.typeLabel}</span>
        </Tag>
      </TableCell>
    </TableRow>
  );
}

export default function ExportPage() {
  const { namespace } = useNamespace();
  const [resources, setResources] = useState<ResourceExportData>({});
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [exportingAction, setExportingAction] = useState<ExportAction | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [lastExportTime, setLastExportTime] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const showLoading = useDelayedLoading(isLoading);

  const loadResources = useCallback(async () => {
    try {
      setIsLoading(true);
      setSelectedKeys(new Set());
      const [data, lastTime] = await Promise.all([
        exportService.fetchAllResources(namespace),
        exportService.getLastExportTime(),
      ]);
      setResources(data);
      setLastExportTime(lastTime);
    } catch (error) {
      toast.error('Failed to load resources', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    loadResources();
  }, [namespace, loadResources]);

  const allRows = useMemo<ExportRow[]>(() => {
    const rows: ExportRow[] = [];
    for (const meta of RESOURCES) {
      for (const item of resources[meta.type] ?? []) {
        rows.push({ meta, item });
      }
    }
    return rows;
  }, [resources]);

  const searchedRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return allRows;
    }
    return allRows.filter(
      row =>
        row.item.name.toLowerCase().includes(query) ||
        (row.item.description?.toLowerCase().includes(query) ?? false),
    );
  }, [allRows, searchQuery]);

  const visibleRows = useMemo(() => {
    if (activeTab === 'all') {
      return searchedRows;
    }
    return searchedRows.filter(row => row.meta.type === activeTab);
  }, [searchedRows, activeTab]);

  const tabCounts = useMemo(() => {
    const counts = new Map<TabValue, number>(
      RESOURCES.map(meta => [meta.type, 0]),
    );
    for (const row of searchedRows) {
      counts.set(row.meta.type, (counts.get(row.meta.type) ?? 0) + 1);
    }
    counts.set('all', searchedRows.length);
    return counts;
  }, [searchedRows]);

  const totalCount = allRows.length;
  const selectedCount = selectedKeys.size;
  const visibleSelectedCount = visibleRows.filter(row =>
    selectedKeys.has(rowKey(row)),
  ).length;

  let headerChecked: boolean | 'indeterminate' = false;
  if (visibleSelectedCount > 0) {
    headerChecked =
      visibleSelectedCount === visibleRows.length ? true : 'indeterminate';
  }

  const toggleKeys = (keys: readonly string[], selected: boolean) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      for (const key of keys) {
        if (selected) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  };

  const buildSelection = (): ResourceExportData => {
    const selection: ResourceExportData = {};
    for (const row of allRows) {
      if (!selectedKeys.has(rowKey(row))) {
        continue;
      }
      const items = selection[row.meta.type] ?? [];
      items.push({ ...row.item, selected: true });
      selection[row.meta.type] = items;
    }
    return selection;
  };

  const handleExport = async (action: ExportAction) => {
    if (action === 'selected' && selectedCount === 0) {
      toast.error('No resources selected', {
        description: 'Please select at least one resource to export',
      });
      return;
    }

    try {
      setExportingAction(action);

      if (action === 'all') {
        await exportService.exportAll(namespace);
        toast.success('Export successful', {
          description: 'Successfully exported all resources',
        });
      } else {
        await exportService.exportResources(namespace, buildSelection());
        toast.success('Export successful', {
          description: `Successfully exported ${selectedCount} resources`,
        });
      }

      setLastExportTime(await exportService.getLastExportTime());
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setExportingAction(null);
    }
  };

  const formatLastExportTime = () => {
    if (!lastExportTime) {
      return 'Never';
    }
    return new Date(lastExportTime).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeTabLabel =
    activeTab === 'all'
      ? 'resources'
      : (RESOURCES.find(meta => meta.type === activeTab)?.label ?? 'resources');

  const noResultsMessage = searchQuery.trim()
    ? 'No resources match your search.'
    : `There are no ${activeTabLabel} to export.`;

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <ResourcePageHeader
        icon={<SaveAlt />}
        title="Exports"
        description="Export your Ark resources to YAML files"
        actions={
          <>
            <Button
              variant="outline"
              disabled={exportingAction !== null || selectedCount === 0}
              onClick={() => handleExport('selected')}>
              {exportingAction === 'selected' && <Spinner size="sm" />}
              Export selected ({selectedCount})
            </Button>
            <Button
              disabled={exportingAction !== null || totalCount === 0}
              onClick={() => handleExport('all')}>
              {exportingAction === 'all' && <Spinner size="sm" />}
              Export all ({totalCount})
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
          {lastExportTime && (
            <span className="text-fg-tertiary text-xs leading-4">
              Last export: {formatLastExportTime()}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TagToggle
            size="default"
            className={TAG_CLASSES}
            pressed={activeTab === 'all'}
            onPressedChange={pressed => {
              if (pressed) {
                setActiveTab('all');
              }
            }}>
            All ({tabCounts.get('all') ?? 0})
          </TagToggle>
          {RESOURCES.map(meta => {
            const Icon = meta.icon;
            return (
              <TagToggle
                key={meta.type}
                size="default"
                className={TAG_CLASSES}
                pressed={activeTab === meta.type}
                onPressedChange={pressed => {
                  if (pressed) {
                    setActiveTab(meta.type);
                  }
                }}>
                <IconShell
                  size="sm"
                  variant={activeTab === meta.type ? 'primary' : 'secondary'}>
                  <Icon />
                </IconShell>
                {meta.label} ({tabCounts.get(meta.type) ?? 0})
              </TagToggle>
            );
          })}
        </div>
      </div>

      {showLoading && (
        <div className="text-fg-secondary flex flex-1 items-center justify-center py-8">
          Loading...
        </div>
      )}

      {!isLoading && visibleRows.length === 0 && (
        <ResourceNoResults icon={<SaveAlt />} message={noResultsMessage} />
      )}

      {!isLoading && visibleRows.length > 0 && (
        <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <Table
            aria-label="Exportable resources"
            className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
            <TableHeader>
              <TableRow>
                <TableHead size="small" className={COL.select}>
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={checked =>
                      toggleKeys(visibleRows.map(rowKey), checked === true)
                    }
                    aria-label="Select all resources"
                  />
                </TableHead>
                <TableHead size="small" className={COL.name}>
                  Name
                </TableHead>
                <TableHead size="small">Description</TableHead>
                <TableHead size="small" className={COL.type}>
                  Type
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(row => {
                const key = rowKey(row);
                return (
                  <ExportTableRow
                    key={key}
                    row={row}
                    selected={selectedKeys.has(key)}
                    onToggle={selected => toggleKeys([key], selected)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}
