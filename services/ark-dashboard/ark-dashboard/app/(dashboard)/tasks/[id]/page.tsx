'use client';

import { useParams, useRouter } from 'next/navigation';

import JsonDisplay from '@/components/JsonDisplay';
import { PageHeader } from '@/components/common/page-header';
import { StatusDot } from '@/components/sections/a2a-tasks-section/status-dot';
import { mapTaskPhaseToVariant } from '@/components/sections/a2a-tasks-section/utils';
import { Button } from '@/components/ui/button';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';
import { simplifyDuration } from '@/lib/utils/time';

export default function A2ATaskPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const { data: task, isLoading, error } = useA2ATask(taskId);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading task...</div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold">Error loading task</h1>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'Task not found'}
          </p>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mt-4">
            ← Back
          </Button>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { href: '/', label: 'ARK Dashboard' },
    { href: '/tasks', label: 'A2A Tasks' },
  ];

  const duration =
    task.metadata?.creationTimestamp && task.status?.completionTime
      ? simplifyDuration(
          (new Date(task.status.completionTime).getTime() -
            new Date(task.metadata.creationTimestamp as string).getTime()) /
            1000 +
            's',
        )
      : '-';

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage={task.name} />
      <div className="flex flex-1 flex-col overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Column 1: Identity & Status */}
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-medium text-gray-500">
                Identity
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Task ID</span>
                  <span className="font-mono">{task.taskId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phase</span>
                  <div className="flex items-center justify-center gap-2">
                    <span>{task.status?.phase}</span>
                    <StatusDot
                      variant={mapTaskPhaseToVariant(task.status?.phase)}
                    />
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Protocol State</span>
                  <span>{task.status?.protocolState || '-'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-medium text-gray-500">
                Relationships
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Agent</span>
                  <span>{task.agentRef?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Query</span>
                  <span>{task.queryRef?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Server</span>
                  <span>{task.a2aServerRef?.name || '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Configuration & Timing */}
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-medium text-gray-500">Timing</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span>
                    {task.metadata?.creationTimestamp
                      ? new Date(
                          task.metadata.creationTimestamp as string,
                        ).toLocaleString()
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Completed</span>
                  <span>
                    {task.status?.completionTime
                      ? new Date(task.status.completionTime).toLocaleString()
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Duration</span>
                  <span>{duration}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Timeout</span>
                  <span>{task.timeout || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">TTL</span>
                  <span>{task.ttl || '-'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-medium text-gray-500">
                Configuration
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Input</span>
                  <div className="mt-1 rounded bg-gray-50 p-2 font-mono text-xs dark:bg-gray-800">
                    {task.input || '-'}
                  </div>
                </div>
                {task.parameters && (
                  <div>
                    <span className="text-gray-500">Parameters</span>
                    <div className="mt-1">
                      <JsonDisplay value={task.parameters} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 3: Raw Data */}
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-medium text-gray-500">
                Raw Data
              </h3>
              <div className="max-h-[500px] overflow-auto">
                <JsonDisplay value={task} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
