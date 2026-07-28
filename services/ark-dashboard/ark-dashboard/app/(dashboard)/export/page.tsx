'use client';

import type { ComponentType, SVGProps } from 'react';
import { useEffect, useMemo, useState } from 'react';

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
import type {
  ExportItem,
  ResourceExportData,
  ResourceType,
} from '@/lib/services/export';
import { exportService } from '@/lib/services/export';

type TabValue = ResourceType | 'all';

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

const TABLE_COL = {
  select: 'w-12',
  name: 'w-[240px]',
  type: 'w-[160px]',
};

interface ExportRow {
  readonly meta: ResourceMeta;
  readonly item: ExportItem;
}

function rowKey(row: ExportRow): string {
  return `${row.meta.type}:${row.item.id}`;
}

function getHeaderCheckedState(
  selected: number,
  total: number,
): boolean | 'indeterminate' {
  if (total > 0 && selected === total) return true;
  if (selected > 0) return 'indeterminate';
  return false;
}

interface ExportTableRowProps {
  readonly row: ExportRow;
  readonly onToggle: (selected: boolean) => void;
}

function ExportTableRow({ row, onToggle }: Readonly<ExportTableRowProps>) {
  const { meta, item } = row;
  const Icon = meta.icon;
  const selected = item.selected ?? false;

  return (
    <TableRow
      className="relative isolate cursor-pointer transition-colors"
      onClick={() => onToggle(!selected)}>
      <TableCell size="small" className={TABLE_COL.select}>
        <span aria-hidden className={rowHoverOverlayClass} />
        <Checkbox
          checked={selected}
          onCheckedChange={checked => onToggle(checked === true)}
          onClick={event => event.stopPropagation()}
          aria-label={`Select ${item.name}`}
        />
      </TableCell>
      <TableCell size="small" className={TABLE_COL.name}>
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
      <TableCell size="small" className={TABLE_COL.type}>
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
  const [resources, setResources] = useState<ResourceExportData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [lastExportTime, setLastExportTime] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadResources();
    exportService.getLastExportTime().then(lastTime => {
      setLastExportTime(lastTime);
    });
  }, []);

  const loadResources = async () => {
    try {
      setIsLoading(true);
      const data = await exportService.fetchAllResources();

      const initializedData: ResourceExportData = {};
      for (const [key, items] of Object.entries(data)) {
        if (items && Array.isArray(items)) {
          initializedData[key as ResourceType] = items.map(item => ({
            ...item,
            selected: false,
          }));
        }
      }

      setResources(initializedData);
    } catch (error) {
      toast.error('Failed to load resources', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
    if (!query) return allRows;
    return allRows.filter(
      row =>
        row.item.name.toLowerCase().includes(query) ||
        (row.item.description?.toLowerCase().includes(query) ?? false),
    );
  }, [allRows, searchQuery]);

  const visibleRows = useMemo(() => {
    if (activeTab === 'all') return searchedRows;
    return searchedRows.filter(row => row.meta.type === activeTab);
  }, [searchedRows, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabValue, number> = {
      all: searchedRows.length,
      agents: 0,
      teams: 0,
      models: 0,
      queries: 0,
      a2a: 0,
      mcpservers: 0,
      workflows: 0,
    };
    for (const row of searchedRows) {
      counts[row.meta.type] += 1;
    }
    return counts;
  }, [searchedRows]);

  const totalCount = allRows.length;
  const selectedCount = allRows.filter(row => row.item.selected).length;
  const visibleSelectedCount = visibleRows.filter(
    row => row.item.selected,
  ).length;

  const setSelection = (keys: ReadonlySet<string>, selected: boolean) => {
    setResources(prev => {
      const next: ResourceExportData = {};
      for (const meta of RESOURCES) {
        const items = prev[meta.type];
        if (!items) continue;
        next[meta.type] = items.map(item =>
          keys.has(`${meta.type}:${item.id}`) ? { ...item, selected } : item,
        );
      }
      return next;
    });
  };

  const handleSelectVisible = (selected: boolean) => {
    setSelection(new Set(visibleRows.map(rowKey)), selected);
  };

  const handleSelectRow = (row: ExportRow, selected: boolean) => {
    setSelection(new Set([rowKey(row)]), selected);
  };

  const handleExport = async (exportAll: boolean) => {
    if (!exportAll && selectedCount === 0) {
      toast.error('No resources selected', {
        description: 'Please select at least one resource to export',
      });
      return;
    }

    try {
      setIsExporting(true);

      if (exportAll) {
        await exportService.exportAll();
        toast.success('Export successful', {
          description: 'Successfully exported all resources',
        });
      } else {
        await exportService.exportResources(resources);
        toast.success('Export successful', {
          description: `Successfully exported ${selectedCount} resources`,
        });
      }

      exportService.getLastExportTime().then(time => setLastExportTime(time));
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatLastExportTime = () => {
    if (!lastExportTime) return 'Never';
    return new Date(lastExportTime).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const noResultsMessage =
    totalCount === 0
      ? 'There are no resources available to export.'
      : 'No resources match your search.';

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1" data-testid="page-header">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              <SaveAlt />
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              Exports
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Export your Ark resources to YAML files
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={isExporting || selectedCount === 0}
            onClick={() => handleExport(false)}>
            {isExporting && <Spinner size="sm" />}
            Export selected ({selectedCount})
          </Button>
          <Button
            disabled={isExporting || totalCount === 0}
            onClick={() => handleExport(true)}>
            {isExporting && <Spinner size="sm" />}
            Export all ({totalCount})
          </Button>
        </div>
      </div>

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
              if (pressed) setActiveTab('all');
            }}>
            All ({tabCounts.all})
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
                  if (pressed) setActiveTab(meta.type);
                }}>
                <IconShell
                  size="sm"
                  variant={activeTab === meta.type ? 'primary' : 'secondary'}>
                  <Icon />
                </IconShell>
                {meta.label} ({tabCounts[meta.type]})
              </TagToggle>
            );
          })}
        </div>
      </div>

      {isLoading && (
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
                <TableHead size="small" className={TABLE_COL.select}>
                  <Checkbox
                    checked={getHeaderCheckedState(
                      visibleSelectedCount,
                      visibleRows.length,
                    )}
                    onCheckedChange={checked =>
                      handleSelectVisible(checked === true)
                    }
                    aria-label="Select all resources"
                  />
                </TableHead>
                <TableHead size="small" className={TABLE_COL.name}>
                  Name
                </TableHead>
                <TableHead size="small">Description</TableHead>
                <TableHead size="small" className={TABLE_COL.type}>
                  Type
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(row => (
                <ExportTableRow
                  key={rowKey(row)}
                  row={row}
                  onToggle={selected => handleSelectRow(row, selected)}
                />
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}
