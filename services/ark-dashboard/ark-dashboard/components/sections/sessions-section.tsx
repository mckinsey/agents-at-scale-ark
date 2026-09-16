'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ErrorBoundary } from '@/components/common/error-boundary';
import {
  AccountTree,
  AutoAwesome,
  Bolt,
  Build,
  Cancel,
  ChatBubble,
  CheckCircle,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Code,
  Database,
  Dns,
  ErrorIcon,
  InsertDriveFile,
  Memory as MemoryIcon,
  OpenInNew,
  Schedule,
  Search as SearchIcon,
  SmartToy,
  Terminal2,
} from '@/components/icons';
import {
  ResourceErrorState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useDebounce } from '@/lib/hooks/use-debounce';
import {
  mapArgoWorkflowToSession,
  mapArgoWorkflowsToSessions,
} from '@/lib/services/workflow-mapper';
import { useWorkflow, useWorkflows } from '@/lib/services/workflows-hooks';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

type SessionSourceFilter = 'all' | 'workflows' | 'teams' | 'agents';
type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
type WorkflowStepType = 'dag' | 'steps' | 'container' | 'script' | 'suspend';
type SortOrder = 'newest' | 'oldest';
type TeamStepType =
  | 'orchestrator'
  | 'agent'
  | 'delegation'
  | 'tool-call'
  | 'response';

const sortOrderItems = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
];

const statusFilterItems = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'Running' },
  { label: 'Succeeded', value: 'Succeeded' },
  { label: 'Failed', value: 'Failed' },
];

interface WorkflowStepDetail {
  image?: string;
  command?: string[];
  args?: string[];
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  logs?: string[];
  exitCode?: number;
  resources?: {
    cpu?: string;
    memory?: string;
  };
  workflowName?: string;
  nodeId?: string;
  namespace?: string;
  podName?: string;
}

interface TeamStepDetail {
  model?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  input?: string;
  output?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  thinking?: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  displayName: string;
  type: WorkflowStepType;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  message?: string;
  detail?: WorkflowStepDetail;
  children?: WorkflowStep[];
}

interface TeamStep {
  id: string;
  agentName: string;
  displayName: string;
  type: TeamStepType;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  message?: string;
  detail?: TeamStepDetail;
  children?: TeamStep[];
}

interface BaseSession {
  id: string;
  name: string;
  status: StepStatus;
  startedAt: string;
  finishedAt?: string;
  duration: string;
  namespace?: string;
  uid?: string;
}

interface WorkflowSession extends BaseSession {
  type: 'workflow';
  steps: WorkflowStep[];
}

interface TeamSession extends BaseSession {
  type: 'team';
  steps: TeamStep[];
}

type Session = WorkflowSession | TeamSession;

const STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  skipped: 'Skipped',
};

function getStatusBorderClass(status: StepStatus): string {
  switch (status) {
    case 'succeeded':
      return 'border-l-stroke-status-success';
    case 'failed':
      return 'border-l-stroke-status-error';
    case 'running':
      return 'border-l-stroke-status-focus';
    default:
      return 'border-l-stroke-divider';
  }
}

function getStatusIcon(status: StepStatus) {
  switch (status) {
    case 'succeeded':
      return (
        <IconShell size="sm" className="text-status-success">
          <CheckCircle />
        </IconShell>
      );
    case 'failed':
      return (
        <IconShell size="sm" className="text-status-error">
          <ErrorIcon />
        </IconShell>
      );
    case 'running':
      return (
        <IconShell size="sm" className="text-fg-secondary" asChild>
          <Spinner size="sm" />
        </IconShell>
      );
    case 'skipped':
      return (
        <IconShell size="sm" variant="secondary">
          <Cancel />
        </IconShell>
      );
    default:
      return (
        <IconShell size="sm" variant="secondary">
          <Schedule />
        </IconShell>
      );
  }
}

function DurationLabel({ duration }: { readonly duration: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconShell size="sm" variant="secondary">
        <Schedule />
      </IconShell>
      <span className="paragraph-small-primary text-fg-secondary whitespace-nowrap">
        {duration}
      </span>
    </div>
  );
}

function StatusLabel({ status }: { readonly status: StepStatus }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {getStatusIcon(status)}
      <span className="paragraph-small-primary text-fg-secondary whitespace-nowrap">
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

function TreeConnector({ isLast }: { readonly isLast: boolean }) {
  return (
    <div className="relative h-10 w-5 shrink-0" aria-hidden="true">
      <div
        className={cn(
          'bg-stroke-divider absolute top-0 left-0 w-px',
          isLast ? 'h-5' : 'h-full',
        )}
      />
      <div className="bg-stroke-divider absolute top-5 left-0 h-px w-5" />
    </div>
  );
}

function TraceRow({
  title,
  status,
  duration,
  isOpen,
  isEmphasised,
  onToggle,
}: {
  readonly title: string;
  readonly status: StepStatus;
  readonly duration?: string;
  readonly isOpen: boolean;
  readonly isEmphasised: boolean;
  readonly onToggle?: () => void;
}) {
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-5">
        {onToggle ? (
          <IconShell size="default" variant="secondary">
            {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </IconShell>
        ) : (
          <span className="size-6 shrink-0" aria-hidden="true" />
        )}
        <span
          className={cn(
            'label-regular-primary min-w-0 flex-1 truncate text-left',
            isEmphasised ? 'text-fg-primary' : 'text-fg-secondary',
          )}
          title={title}>
          {title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {duration && <DurationLabel duration={duration} />}
        <StatusLabel status={status} />
      </div>
    </>
  );

  const rowClass = cn(
    'flex w-full min-w-0 items-center justify-between border-l-2 p-2 transition-colors',
    getStatusBorderClass(status),
    isOpen && 'bg-stateslayer-overlay-pressed',
  );

  if (!onToggle) {
    return <div className={rowClass}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label={`${title}, ${isOpen ? 'hide' : 'show'} details`}
      className={cn(
        rowClass,
        'hover:bg-stateslayer-overlay-hover cursor-pointer text-left',
      )}>
      {content}
    </button>
  );
}

function LogEntryBlock({
  icon,
  label,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 py-2 pr-2">
      <div className="flex items-center gap-1">
        <IconShell size="sm" variant="secondary">
          {icon}
        </IconShell>
        <span className="paragraph-small-primary text-fg-secondary">
          {label}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 pl-5">{children}</div>
    </div>
  );
}

function LogEntryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex w-full min-w-0 items-start gap-1">
      <span className="paragraph-small-primary text-fg-secondary shrink-0">
        {label}
      </span>
      <span className="paragraph-small-primary text-fg-primary min-w-0 break-words">
        {value}
      </span>
    </div>
  );
}

function WorkflowStepDetail({
  detail,
  message,
}: {
  detail: WorkflowStepDetail;
  message?: string;
}) {
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const shouldFetchLogs =
    detail.workflowName && detail.nodeId && detail.namespace;

  useEffect(() => {
    if (!shouldFetchLogs) return;

    let cancelled = false;

    const fetchLogs = async () => {
      setLoadingLogs(true);
      setLogsError(null);
      try {
        const { workflowsService } = await import('@/lib/services/workflows');
        let logData = '';

        // Try to get logs from pod first (more reliable for recent workflows)
        if (detail.podName) {
          try {
            logData = await workflowsService.getPodLogs(
              detail.namespace!,
              detail.podName,
            );
          } catch {
            // If pod logs fail, try archived workflow logs
            console.debug('Pod logs not available, trying archived logs');
          }
        }

        // If pod logs didn't work or no podName, try archived workflow logs
        if (!logData) {
          logData = await workflowsService.getWorkflowLogs(
            detail.namespace!,
            detail.workflowName!,
            detail.nodeId!,
          );
        }

        if (!cancelled) {
          setLogs(logData);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('404')) {
            setLogsError(
              'Logs not available (pod terminated and logs not archived)',
            );
          } else {
            setLogsError('Failed to load logs');
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingLogs(false);
        }
      }
    };

    void fetchLogs();

    return () => {
      cancelled = true;
    };
  }, [
    detail.workflowName,
    detail.nodeId,
    detail.namespace,
    detail.podName,
    shouldFetchLogs,
  ]);

  return (
    <div className="flex w-full min-w-0 flex-col pl-10">
      {detail.image && (
        <LogEntryBlock icon={<Dns />} label="Image">
          <span className="paragraph-small-primary text-fg-primary break-all">
            {detail.image}
          </span>
        </LogEntryBlock>
      )}

      {detail.command && (
        <LogEntryBlock icon={<Code />} label="Command">
          <span className="paragraph-small-primary text-fg-primary break-all">
            {detail.command.join(' ')} {detail.args?.join(' ')}
          </span>
        </LogEntryBlock>
      )}

      {detail.inputs && Object.keys(detail.inputs).length > 0 && (
        <LogEntryBlock icon={<InsertDriveFile />} label="Inputs">
          {Object.entries(detail.inputs).map(([key, value]) => (
            <LogEntryRow key={key} label={`${key}:`} value={value} />
          ))}
        </LogEntryBlock>
      )}

      {detail.outputs && Object.keys(detail.outputs).length > 0 && (
        <LogEntryBlock icon={<InsertDriveFile />} label="Outputs">
          {Object.entries(detail.outputs).map(([key, value]) => (
            <LogEntryRow key={key} label={key} value={value} />
          ))}
        </LogEntryBlock>
      )}

      {message && (
        <LogEntryBlock icon={<ErrorIcon />} label="Message">
          <div className="bg-fill-onsurface-ui-1 w-full p-2">
            <p className="paragraph-regular-primary text-fg-secondary break-words">
              {message}
            </p>
          </div>
        </LogEntryBlock>
      )}

      {shouldFetchLogs && (
        <LogEntryBlock icon={<Terminal2 />} label="Logs">
          <div className="bg-fill-onsurface-ui-1 max-h-64 w-full overflow-auto p-2">
            {loadingLogs && (
              <div className="flex items-center gap-2">
                <Spinner size="sm" className="text-fg-tertiary" />
                <span className="paragraph-small-primary text-fg-tertiary">
                  Loading logs...
                </span>
              </div>
            )}
            {logsError && (
              <div className="flex flex-col items-start gap-2">
                <p className="paragraph-small-primary text-fg-warning">
                  {logsError}
                </p>
                <Button variant="ghost" size="xs" asChild>
                  <a
                    href={`${process.env.NEXT_PUBLIC_ARGO_URL || 'http://localhost:2746'}/workflows/${detail.namespace}/${detail.workflowName}?tab=workflow&nodeId=${detail.nodeId}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    View logs in Argo UI
                    <IconShell size="sm">
                      <OpenInNew />
                    </IconShell>
                  </a>
                </Button>
              </div>
            )}
            {!loadingLogs && !logsError && (
              <pre className="paragraph-regular-primary text-fg-secondary break-words whitespace-pre-wrap">
                {logs || 'No logs available'}
              </pre>
            )}
          </div>
        </LogEntryBlock>
      )}

      {detail.exitCode !== undefined && (
        <LogEntryBlock icon={<Code />} label="Exit code">
          <span className="paragraph-small-primary text-fg-primary">
            {detail.exitCode}
          </span>
        </LogEntryBlock>
      )}

      {detail.resources && (
        <div className="flex w-full flex-wrap items-start gap-6 py-2 pr-2">
          {detail.resources.cpu && (
            <div className="flex items-center gap-1">
              <IconShell size="sm" variant="secondary">
                <MemoryIcon />
              </IconShell>
              <span className="paragraph-small-primary text-fg-secondary">
                CPU:{' '}
                <span className="text-fg-primary">{detail.resources.cpu}</span>
              </span>
            </div>
          )}
          {detail.resources.memory && (
            <div className="flex items-center gap-1">
              <IconShell size="sm" variant="secondary">
                <Database />
              </IconShell>
              <span className="paragraph-small-primary text-fg-secondary">
                Memory:{' '}
                <span className="text-fg-primary">
                  {detail.resources.memory}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamStepDetail({ detail }: { detail: TeamStepDetail }) {
  return (
    <div className="flex w-full min-w-0 flex-col pl-10">
      {detail.model && (
        <LogEntryBlock icon={<SmartToy />} label="Model">
          <span className="paragraph-small-primary text-fg-primary break-all">
            {detail.model}
          </span>
        </LogEntryBlock>
      )}

      {detail.tokensUsed && (
        <LogEntryBlock icon={<Bolt />} label="Tokens">
          <LogEntryRow
            label="input:"
            value={detail.tokensUsed.input.toLocaleString()}
          />
          <LogEntryRow
            label="output:"
            value={detail.tokensUsed.output.toLocaleString()}
          />
        </LogEntryBlock>
      )}

      {detail.input && (
        <LogEntryBlock icon={<ChatBubble />} label="Input">
          <span className="paragraph-small-primary text-fg-primary break-words whitespace-pre-wrap">
            {detail.input}
          </span>
        </LogEntryBlock>
      )}

      {detail.thinking && (
        <LogEntryBlock icon={<AutoAwesome />} label="Thinking">
          <span className="paragraph-small-primary text-fg-secondary break-words whitespace-pre-wrap italic">
            {detail.thinking}
          </span>
        </LogEntryBlock>
      )}

      {detail.toolInput && (
        <LogEntryBlock icon={<Build />} label="Tool input">
          <div className="bg-fill-onsurface-ui-1 w-full overflow-auto p-2">
            <pre className="paragraph-small-primary text-fg-secondary break-words whitespace-pre-wrap">
              {JSON.stringify(detail.toolInput, null, 2)}
            </pre>
          </div>
        </LogEntryBlock>
      )}

      {detail.toolOutput !== undefined && (
        <LogEntryBlock icon={<Bolt />} label="Tool output">
          <div className="bg-fill-onsurface-ui-1 w-full overflow-auto p-2">
            <pre className="paragraph-small-primary text-fg-secondary break-words whitespace-pre-wrap">
              {JSON.stringify(detail.toolOutput, null, 2)}
            </pre>
          </div>
        </LogEntryBlock>
      )}

      {detail.output && (
        <LogEntryBlock icon={<ChatBubble />} label="Output">
          <span className="paragraph-small-primary text-fg-primary break-words whitespace-pre-wrap">
            {detail.output}
          </span>
        </LogEntryBlock>
      )}
    </div>
  );
}

function WorkflowStepNode({
  step,
  depth = 0,
  isLast = false,
}: {
  step: WorkflowStep;
  depth?: number;
  isLast?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const hasChildren = step.children && step.children.length > 0;
  const hasDetail = step.detail && Object.keys(step.detail).length > 0;

  const isParallelContainer =
    step.type === 'steps' &&
    hasChildren &&
    step.children!.length > 1 &&
    /^\[\d+\]$/.test(step.displayName);

  if (isParallelContainer) {
    return (
      <>
        {step.children!.map((child, index) => (
          <WorkflowStepNode
            key={child.id}
            step={child}
            depth={depth}
            isLast={index === step.children!.length - 1}
          />
        ))}
      </>
    );
  }

  return (
    <div className={cn('flex w-full min-w-0', depth > 0 && 'pl-5')}>
      {depth > 0 && <TreeConnector isLast={isLast && !hasChildren} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TraceRow
          title={step.displayName}
          status={step.status}
          duration={step.duration}
          isOpen={showDetail}
          isEmphasised={showDetail || !!hasChildren}
          onToggle={hasDetail ? () => setShowDetail(!showDetail) : undefined}
        />

        {hasDetail && showDetail && (
          <WorkflowStepDetail detail={step.detail!} message={step.message} />
        )}

        {hasChildren &&
          step.children!.map((child, index) => (
            <WorkflowStepNode
              key={child.id}
              step={child}
              depth={depth + 1}
              isLast={index === step.children!.length - 1}
            />
          ))}
      </div>
    </div>
  );
}

function TeamStepNode({
  step,
  depth = 0,
  isLast = false,
}: {
  step: TeamStep;
  depth?: number;
  isLast?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const hasChildren = step.children && step.children.length > 0;
  const hasDetail = step.detail && Object.keys(step.detail).length > 0;

  return (
    <div className={cn('flex w-full min-w-0', depth > 0 && 'pl-5')}>
      {depth > 0 && <TreeConnector isLast={isLast && !hasChildren} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TraceRow
          title={step.displayName}
          status={step.status}
          duration={step.duration}
          isOpen={showDetail}
          isEmphasised={showDetail || !!hasChildren}
          onToggle={hasDetail ? () => setShowDetail(!showDetail) : undefined}
        />

        {hasDetail && showDetail && <TeamStepDetail detail={step.detail!} />}

        {hasChildren &&
          step.children!.map((child, index) => (
            <TeamStepNode
              key={child.id}
              step={child}
              depth={depth + 1}
              isLast={index === step.children!.length - 1}
            />
          ))}
      </div>
    </div>
  );
}

function SessionDetailView({
  session,
  isLoading = false,
}: {
  session: Session;
  isLoading?: boolean;
}) {
  return (
    <div className="border-fill-onsurface-ui-1 flex h-full min-h-0 min-w-0 flex-1 flex-col border">
      <div className="bg-surface-secondary flex h-10 shrink-0 items-center justify-between gap-3 px-3">
        <span
          className="paragraph-regular-primary text-fg-primary min-w-0 flex-1 truncate"
          title={session.name}>
          {session.name}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {isLoading && (
            <div className="flex items-center gap-1">
              <Spinner size="sm" className="text-fg-tertiary" />
              <span className="paragraph-small-primary text-fg-secondary">
                Updating
              </span>
            </div>
          )}
          <StatusLabel status={session.status} />
          {session.type === 'workflow' && session.namespace && session.uid && (
            <Button variant="outline" size="xs" asChild>
              <a
                href={`${process.env.NEXT_PUBLIC_ARGO_URL || 'http://localhost:2746'}/workflows/${session.namespace}/${session.name}?uid=${session.uid}`}
                target="_blank"
                rel="noopener noreferrer">
                View in Argo
                <IconShell size="sm">
                  <OpenInNew />
                </IconShell>
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4">
        {session.type === 'workflow'
          ? session.steps.map(step => (
              <WorkflowStepNode key={step.id} step={step} />
            ))
          : session.steps.map(step => (
              <TeamStepNode key={step.id} step={step} />
            ))}
      </div>
    </div>
  );
}

function SessionListItem({
  session,
  isSelected,
  onClick,
}: {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={session.name}
      aria-current={isSelected}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-center px-3 py-2 text-left transition-colors',
        isSelected
          ? 'bg-fill-onsurface-ui-1'
          : 'hover:bg-stateslayer-overlay-hover',
      )}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1">
            <span role="img" aria-label={STATUS_LABELS[session.status]}>
              {getStatusIcon(session.status)}
            </span>
            <span className="paragraph-small-primary text-fg-secondary">
              {new Date(session.startedAt).toLocaleString()}
            </span>
          </div>
          <span className="paragraph-regular-primary text-fg-primary w-full truncate">
            {session.name}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <DurationLabel duration={session.duration} />
          <span className="label-small-primary text-fg-secondary py-1 capitalize">
            {session.type}
          </span>
        </div>
      </div>
    </button>
  );
}

const normalizeStatus = (status: string): string => {
  if (!status || status === 'all') return 'all';

  const statusMap: Record<string, string> = {
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    error: 'Error',
    pending: 'Pending',
  };

  return statusMap[status.toLowerCase()] || status;
};

export function SessionsSection() {
  const { namespace } = useNamespace();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Note: sourceFilter is currently unused but reserved for future support of Team sessions
  // Currently only workflow sessions are implemented
  const [sourceFilter] = useState<SessionSourceFilter>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [useRealData] = useState(true);

  const [workflowNameInput, setWorkflowNameInput] = useState(
    searchParams.get('workflowName') || '',
  );
  const [workflowTemplateNameInput, setWorkflowTemplateNameInput] = useState(
    searchParams.get('workflowTemplateName') || '',
  );
  const [statusFilter, setStatusFilter] = useState(
    normalizeStatus(searchParams.get('status') || 'all'),
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (searchParams.get('sort') as SortOrder) || 'newest',
  );
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const templateInputRef = useRef<HTMLDivElement>(null);

  const debouncedWorkflowName = useDebounce(workflowNameInput, 500);
  const debouncedWorkflowTemplateName = useDebounce(
    workflowTemplateNameInput,
    500,
  );

  const filters = useMemo(
    () => ({
      workflowName: debouncedWorkflowName || undefined,
      workflowTemplateName: debouncedWorkflowTemplateName || undefined,
      status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
    }),
    [debouncedWorkflowName, debouncedWorkflowTemplateName, statusFilter],
  );

  // Update URL when filters or sort change
  useEffect(() => {
    const params = new URLSearchParams();

    // Preserve namespace parameter
    const namespaceParam = searchParams.get('namespace');
    if (namespaceParam) {
      params.set('namespace', namespaceParam);
    }

    if (debouncedWorkflowName) {
      params.set('workflowName', debouncedWorkflowName);
    }
    if (debouncedWorkflowTemplateName) {
      params.set('workflowTemplateName', debouncedWorkflowTemplateName);
    }
    if (statusFilter && statusFilter !== 'all') {
      params.set('status', statusFilter.toLowerCase());
    }
    if (sortOrder !== 'newest') {
      params.set('sort', sortOrder);
    }

    const queryString = params.toString();
    if (queryString === searchParams.toString()) {
      return;
    }
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [
    searchParams,
    debouncedWorkflowName,
    debouncedWorkflowTemplateName,
    statusFilter,
    sortOrder,
    router,
  ]);

  const {
    workflows,
    loading,
    error,
    refetch: refetchWorkflows,
  } = useWorkflows(namespace, filters);

  const allSessions = mapArgoWorkflowsToSessions(workflows);

  const uniqueWorkflowTemplateNames = useMemo(() => {
    const templateNames = new Set<string>();
    workflows.forEach(workflow => {
      const templateName = workflow.spec.workflowTemplateRef?.name;
      if (templateName) {
        templateNames.add(templateName);
      }
    });
    return Array.from(templateNames).sort();
  }, [workflows]);

  const filteredTemplateNames = useMemo(() => {
    if (!workflowTemplateNameInput) return uniqueWorkflowTemplateNames;
    const searchLower = workflowTemplateNameInput.toLowerCase();
    return uniqueWorkflowTemplateNames.filter(name =>
      name.toLowerCase().includes(searchLower),
    );
  }, [uniqueWorkflowTemplateNames, workflowTemplateNameInput]);

  const filteredAndSortedSessions = allSessions
    .filter(session => {
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'workflows') return session.type === 'workflow';
      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.startedAt).getTime();
      const timeB = new Date(b.startedAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

  useEffect(() => {
    if (
      filteredAndSortedSessions.length > 0 &&
      !filteredAndSortedSessions.find(s => s.id === selectedSessionId)
    ) {
      setSelectedSessionId(filteredAndSortedSessions[0].id);
    }
  }, [filteredAndSortedSessions, selectedSessionId]);

  const selectedSessionFromList = filteredAndSortedSessions.find(
    s => s.id === selectedSessionId,
  );

  const { workflow: selectedWorkflowDetail, loading: loadingDetail } =
    useWorkflow(
      namespace,
      useRealData && selectedSessionFromList?.type === 'workflow'
        ? selectedSessionId || ''
        : '',
    );

  const selectedSession =
    useRealData && selectedWorkflowDetail
      ? mapArgoWorkflowToSession(selectedWorkflowDetail)
      : selectedSessionFromList;

  const previousStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (selectedWorkflowDetail && useRealData) {
      const currentStatus = selectedWorkflowDetail.status?.phase;
      const previousStatus = previousStatusRef.current;

      const isTerminalState =
        currentStatus === 'Succeeded' ||
        currentStatus === 'Failed' ||
        currentStatus === 'Error';

      const wasRunning =
        previousStatus === 'Running' || previousStatus === 'Pending';

      if (isTerminalState && wasRunning) {
        void refetchWorkflows();
      }

      previousStatusRef.current = currentStatus;
    }
  }, [selectedWorkflowDetail, useRealData, refetchWorkflows]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        templateInputRef.current &&
        !templateInputRef.current.contains(event.target as Node)
      ) {
        setTemplateDropdownOpen(false);
      }
    };

    if (templateDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [templateDropdownOpen]);

  const hasActiveFilters =
    workflowNameInput ||
    workflowTemplateNameInput ||
    (statusFilter && statusFilter !== 'all') ||
    sortOrder !== 'newest';

  const clearFilters = () => {
    setWorkflowNameInput('');
    setWorkflowTemplateNameInput('');
    setStatusFilter('all');
    setSortOrder('newest');
  };

  return (
    <ErrorBoundary>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex w-full flex-col gap-3 pb-1 lg:flex-row lg:items-end">
          <ResourceSearchInput
            value={workflowNameInput}
            onChange={setWorkflowNameInput}
            placeholder="Search"
            className="w-full lg:max-w-[493px] lg:flex-1"
          />

          <div
            className="flex w-full flex-col gap-2 lg:w-[197px]"
            ref={templateInputRef}>
            <span className="label-regular-primary text-fg-secondary">
              Template
            </span>
            <div className="relative">
              <Input
                type="search"
                placeholder="All templates"
                value={workflowTemplateNameInput}
                onChange={e => {
                  setWorkflowTemplateNameInput(e.target.value);
                  if (!templateDropdownOpen) {
                    setTemplateDropdownOpen(true);
                  }
                }}
                onFocus={() => {
                  setTemplateDropdownOpen(true);
                }}
              />
              {templateDropdownOpen && (
                <div className="bg-surface-secondary border-stroke-divider animate-in fade-in-0 shadow-elevation-2 absolute z-50 mt-1 w-full border">
                  {uniqueWorkflowTemplateNames.length === 0 ? (
                    <div className="paragraph-small-primary text-fg-tertiary px-2 py-3 text-center">
                      No workflow templates found yet.
                      <br />
                      Type to enter a custom value.
                    </div>
                  ) : filteredTemplateNames.length > 0 ? (
                    <div className="max-h-[300px] overflow-y-auto py-1">
                      {filteredTemplateNames.map(templateName => (
                        <button
                          key={templateName}
                          type="button"
                          onClick={() => {
                            setWorkflowTemplateNameInput(templateName);
                            setTemplateDropdownOpen(false);
                          }}
                          className="hover:bg-stateslayer-overlay-hover paragraph-regular-primary text-fg-primary w-full cursor-pointer truncate px-2 py-1.5 text-left transition-colors">
                          {templateName}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="paragraph-small-primary text-fg-tertiary px-2 py-3 text-center">
                      No templates match &ldquo;{workflowTemplateNameInput}
                      &rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-[197px]">
            <span className="label-regular-primary text-fg-secondary">
              Sort
            </span>
            <Select
              items={sortOrderItems}
              value={sortOrder}
              onValueChange={value => setSortOrder(value as SortOrder)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOrderItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-[197px]">
            <span className="label-regular-primary text-fg-secondary">
              Status
            </span>
            <Select
              items={statusFilterItems}
              value={statusFilter || 'all'}
              onValueChange={value => setStatusFilter(value as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                {statusFilterItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="shrink-0">
            Clear filters
          </Button>
        </div>

        {error ? (
          <ResourceErrorState
            title="Couldn't load workflow runs"
            description={`Error: ${error.message}`}
          />
        ) : loading ? (
          <div className="text-fg-secondary flex flex-1 flex-col items-center justify-center gap-4">
            <Spinner className="text-fg-tertiary" />
            <span className="label-large-primary">Loading sessions...</span>
          </div>
        ) : filteredAndSortedSessions.length > 0 ? (
          <div className="flex max-h-[calc(100vh-10rem)] min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:gap-6">
            <div className="flex h-full min-h-0 w-full shrink-0 flex-col gap-2 overflow-y-auto lg:w-[261px]">
              {filteredAndSortedSessions.map(session => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  isSelected={session.id === selectedSessionId}
                  onClick={() => setSelectedSessionId(session.id)}
                />
              ))}
            </div>
            <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
              {selectedSession ? (
                <SessionDetailView
                  session={selectedSession}
                  isLoading={loadingDetail && useRealData}
                />
              ) : (
                <div className="border-fill-onsurface-ui-1 flex flex-1 items-center justify-center border">
                  <ResourceNoResults
                    icon={<AccountTree className="size-full" />}
                    message="Select a session to view details"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {hasActiveFilters ? (
              <>
                <ResourceNoResults
                  icon={<SearchIcon className="size-full" />}
                  message="No workflow runs found matching your filters"
                />
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <ResourceNoResults
                icon={<AccountTree className="size-full" />}
                message={`No ${sourceFilter === 'all' ? '' : sourceFilter} workflow runs to display`}
              />
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
