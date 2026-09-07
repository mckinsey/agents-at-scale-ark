'use client';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { SortableColumnHeader } from '@/components/common/sortable-column-header';
import { Autorenew, PlaylistAddCheck } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceErrorState,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { DOCS_URLS } from '@/lib/constants/docs';
import { timestampValue, useValueSort } from '@/lib/hooks/use-value-sort';
import { type A2ATask } from '@/lib/services/a2a-tasks';
import { useListA2ATasks } from '@/lib/services/a2a-tasks-hooks';
import { cn } from '@/lib/utils';
import { formatAge } from '@/lib/utils/time';

import { TaskStatus } from './task-status';

const SKELETON_ROWS = [1, 2, 3, 4, 5];

const getCreatedTime = (task: A2ATask) =>
  timestampValue(task.creationTimestamp);

function TasksTableSkeleton() {
  return (
    <div
      className="mt-5 flex flex-col gap-1"
      aria-busy="true"
      aria-label="Loading A2A tasks">
      {SKELETON_ROWS.map(row => (
        <Skeleton key={row} className="h-[60px] w-full" />
      ))}
    </div>
  );
}

function TaskRow({ task }: { readonly task: A2ATask }) {
  const href = `/tasks/${encodeURIComponent(task.name)}`;

  return (
    <TableRow className="relative isolate cursor-pointer transition-colors">
      <TableCell size="small" className="w-[110px]">
        {formatAge(task.creationTimestamp)}
      </TableCell>

      <TableCell size="small" className="w-[180px]">
        <span aria-hidden className={rowHoverOverlayClass} />
        <TruncatedTooltip label={task.taskId}>
          <NamespacedLink
            href={href}
            className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
            {task.taskId}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="relative z-10">
        <TruncatedTooltip label={task.name}>
          <NamespacedLink
            href={href}
            tabIndex={-1}
            className="text-fg-primary block w-full truncate">
            {task.name}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="relative z-10 w-[180px]">
        <TruncatedTooltip label={task.agentRef?.name || '—'}>
          <NamespacedLink
            href={href}
            tabIndex={-1}
            className="text-fg-primary block w-full truncate">
            {task.agentRef?.name || '—'}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="relative z-10 w-[180px]">
        <TruncatedTooltip label={task.queryRef?.name || '—'}>
          <NamespacedLink
            href={href}
            tabIndex={-1}
            className="text-fg-primary block w-full truncate">
            {task.queryRef?.name || '—'}
          </NamespacedLink>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className="relative z-10 w-[160px]">
        <TaskStatus phase={task.phase} />
      </TableCell>
    </TableRow>
  );
}

function TasksTable({ data }: { readonly data: A2ATask[] }) {
  const {
    sortDirection,
    toggleSortDirection,
    sortedItems: sortedTasks,
  } = useValueSort(data, getCreatedTime);

  return (
    <div className="mt-5 min-h-0 flex-1 overflow-auto">
      <Table className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
        <TableHeader>
          <TableRow>
            <TableHead size="small" className="w-[110px]">
              <SortableColumnHeader
                label="Created"
                sortDirection={sortDirection}
                onToggle={toggleSortDirection}
              />
            </TableHead>
            <TableHead size="small" className="w-[180px]">
              Task ID
            </TableHead>
            <TableHead size="small">Name</TableHead>
            <TableHead size="small" className="w-[180px]">
              Agent
            </TableHead>
            <TableHead size="small" className="w-[180px]">
              Query
            </TableHead>
            <TableHead size="small" className="w-[160px]">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTasks.map(task => (
            <TaskRow key={task.name} task={task} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function A2ATasksSection() {
  const {
    data: tasksData,
    isPending: loading,
    error,
    refetch,
    isFetching,
  } = useListA2ATasks();

  const tasks = tasksData?.items || [];

  const refreshButton = (
    <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
      <IconShell size="sm">
        <Autorenew className={cn(isFetching && 'animate-spin')} />
      </IconShell>
      Refresh
    </Button>
  );

  const header = (
    <ResourcePageHeader
      icon={<PlaylistAddCheck />}
      title={
        tasksData === undefined ? 'A2A tasks' : `A2A tasks (${tasksData.count})`
      }
      description="Manage agent-to-agent messaging, and collaboration"
      actions={refreshButton}
    />
  );

  if (loading) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {header}
        <TasksTableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {header}
        <ResourceErrorState
          className="mt-5"
          title="Couldn't load A2A tasks"
          description={error instanceof Error ? error.message : String(error)}
        />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {header}
        <ResourceEmptyState
          icon={<PlaylistAddCheck />}
          title="No A2A task yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t added any A2A task yet.</p>
              <p>Get started to see A2A.</p>
            </>
          }
          actions={<LearnMoreButton href={DOCS_URLS.a2aTasks} />}
        />
      </div>
    );
  }

  return (
    <div className="content-shell flex h-full w-full flex-col">
      {header}
      <TasksTable data={tasks} />
    </div>
  );
}
