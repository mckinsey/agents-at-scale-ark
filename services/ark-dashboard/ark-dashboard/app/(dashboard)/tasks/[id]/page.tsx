'use client';

import { useParams } from 'next/navigation';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import {
  DetailCard,
  DetailRow,
  DetailSectionCard,
} from '@/components/common/detail-card';
import { JsonViewer } from '@/components/common/json-viewer';
import { NamespacedLink } from '@/components/namespaced-link';
import { TaskStatus } from '@/components/sections/a2a-tasks-section/task-status';
import { Button } from '@/components/ui/button';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';
import { formatTimestamp, simplifyDuration } from '@/lib/utils/time';

export default function A2ATaskPage() {
  const params = useParams();
  const taskId = params.id as string;

  const { data: task, isLoading, error } = useA2ATask(taskId);

  const breadcrumb = (
    <DetailBreadcrumb
      backHref="/tasks"
      backLabel="A2A tasks"
      current={task?.taskId || taskId}
      className="break-all"
    />
  );

  if (isLoading) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {breadcrumb}
        <div className="mt-5 flex flex-1 items-center justify-center">
          <span className="label-regular-primary text-fg-secondary">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {breadcrumb}
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3">
          <p className="headings-h3-regular text-fg-primary">
            {error ? "Couldn't load this A2A task" : 'A2A task not found'}
          </p>
          {error && (
            <p className="label-regular-primary text-fg-secondary">
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          <NamespacedLink href="/tasks">
            <Button variant="outline">Back to A2A tasks</Button>
          </NamespacedLink>
        </div>
      </div>
    );
  }

  const createdAt = task.metadata?.creationTimestamp as string | undefined;
  const completedAt = task.status?.completionTime;
  const duration =
    createdAt && completedAt
      ? simplifyDuration(
          `${(new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 1000}s`,
        )
      : '—';

  const parameterEntries = Object.entries(task.parameters ?? {});

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <div className="flex flex-col gap-1">
        {breadcrumb}
        <h1 className="headings-h2-regular text-fg-primary break-all">
          {task.taskId || taskId}
        </h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto">
        <div className="flex flex-none flex-col gap-5 lg:flex-row">
          <DetailCard title="Identity">
            <DetailRow
              label="Status"
              value={<TaskStatus phase={task.status?.phase} />}
              valueClassName="min-w-0"
              tooltip="Kubernetes lifecycle phase Ark manages for this task"
            />
            <DetailRow
              label="Protocol state"
              value={task.status?.protocolState || '—'}
              tooltip="Raw state reported by the remote agent over the A2A protocol"
              last
            />
          </DetailCard>

          <DetailCard title="Timing">
            <DetailRow
              label="Created"
              value={formatTimestamp(createdAt)}
              tooltip="When this task resource was created"
            />
            <DetailRow
              label="Completed"
              value={formatTimestamp(completedAt)}
              tooltip="When the task reached a terminal state"
            />
            <DetailRow
              label="Duration"
              value={duration}
              tooltip="Time between creation and completion"
            />
            <DetailRow
              label="Timeout"
              value={task.timeout || '—'}
              tooltip="How long Ark polls before marking the task failed"
            />
            <DetailRow
              label="TTL"
              value={task.ttl || '—'}
              tooltip="How long the task is retained after completion"
              last
            />
          </DetailCard>

          <DetailCard title="Relationships">
            <DetailRow
              label="Agent"
              value={task.agentRef?.name || '—'}
              tooltip="Agent assigned to execute this task"
            />
            <DetailRow
              label="Query"
              value={task.queryRef?.name || '—'}
              tooltip="Query that created this task"
            />
            <DetailRow
              label="Server"
              value={task.a2aServerRef?.name || '—'}
              tooltip="A2A server polled for status updates; empty for approval tasks"
              last
            />
          </DetailCard>
        </div>

        <DetailSectionCard title="Input" className="flex-none">
          <div className="text-fg-primary py-2 text-base leading-6 tracking-[-0.032px] whitespace-pre-wrap">
            {task.input || '—'}
          </div>
        </DetailSectionCard>

        {parameterEntries.length > 0 && (
          <DetailSectionCard title="Parameters" className="flex-none">
            <div className="flex flex-col gap-2 py-2">
              {parameterEntries.map(([name, value]) => (
                <div key={name} className="flex items-center gap-4">
                  <span className="text-fg-secondary w-[140px] shrink-0 font-mono text-xs">
                    {name}
                  </span>
                  <TruncatedTooltip
                    label={String(value)}
                    contentClassName="max-w-[420px] break-all">
                    <span className="text-fg-primary min-w-0 flex-1 truncate font-mono text-xs">
                      {String(value)}
                    </span>
                  </TruncatedTooltip>
                </div>
              ))}
            </div>
          </DetailSectionCard>
        )}

        <DetailSectionCard
          title="Raw Data"
          className="min-h-[240px] flex-1"
          bodyClassName="min-h-0 flex-1 overflow-hidden">
          <JsonViewer
            className="h-full"
            value={task}
            fileName={task.name || taskId}
          />
        </DetailSectionCard>
      </div>
    </div>
  );
}
