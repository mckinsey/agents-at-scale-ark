import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { type A2ATask } from '@/lib/services/a2a-tasks';
import { useListA2ATasks } from '@/lib/services/a2a-tasks-hooks';

import { StatusDot } from './status-dot';
import { mapTaskPhaseToVariant } from './utils';

function DataTable({ data }: { data: A2ATask[] }) {
  const router = useRouter();
  const Icon =
    DASHBOARD_SECTIONS['tasks']?.icon || DASHBOARD_SECTIONS['a2a']?.icon;

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
            <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
              Task ID
            </th>
            <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
              Name
            </th>
            <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
              Phase
            </th>
            <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
              Agent
            </th>
            <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
              Query
            </th>
            <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map(task => (
              <tr
                key={task.name}
                onClick={() => router.push(`/tasks/${task.name}`)}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30">
                <td className="px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">
                  {task.taskId}
                </td>
                <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {task.name}
                </td>
                <td className="px-3 py-3 text-center text-gray-900 dark:text-gray-100">
                  <StatusDot variant={mapTaskPhaseToVariant(task.phase)} />
                </td>
                <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {task.agentRef?.name || '-'}
                </td>
                <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {task.queryRef?.name || '-'}
                </td>
                <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {task.creationTimestamp
                    ? new Date(task.creationTimestamp).toLocaleString()
                    : '-'}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">{Icon && <Icon />}</EmptyMedia>
                    <EmptyTitle>No A2A Tasks Found</EmptyTitle>
                    <EmptyDescription>
                      No Agent-to-Agent tasks have been created yet.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
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

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <div className="py-8 text-center">Loading tasks...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
            <p className="font-medium">Error loading tasks</p>
            <p className="mt-1 text-sm">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}>
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
        <DataTable data={tasks} />
      </main>
    </div>
  );
}
