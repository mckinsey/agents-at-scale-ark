'use client';

import {
  AlertCircle,
  ArrowUpDown,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Container,
  Cpu,
  ExternalLink,
  FileCode,
  FileText,
  GitBranch,
  HardDrive,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Terminal,
  Users,
  Workflow,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useWorkflows, useWorkflow } from '@/lib/services/workflows-hooks';
import { mapArgoWorkflowToSession, mapArgoWorkflowsToSessions } from '@/lib/services/workflow-mapper';
import { useDebounce } from '@/lib/hooks/use-debounce';

type SessionSourceFilter = 'all' | 'workflows' | 'teams' | 'agents';
type SessionType = 'workflow' | 'team' | 'agent';
type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
type WorkflowStepType = 'dag' | 'steps' | 'container' | 'script' | 'suspend';
type SortOrder = 'newest' | 'oldest';
type TeamStepType =
  | 'orchestrator'
  | 'agent'
  | 'delegation'
  | 'tool-call'
  | 'response';

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



function getStatusIcon(status: StepStatus) {
  switch (status) {
    case 'succeeded':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pending':
      return <Circle className="text-muted-foreground h-4 w-4" />;
    case 'skipped':
      return <Circle className="h-4 w-4 text-yellow-500" />;
  }
}

function getWorkflowTypeIcon(type: WorkflowStepType) {
  switch (type) {
    case 'dag':
      return <GitBranch className="h-4 w-4" />;
    case 'steps':
      return <Play className="h-4 w-4" />;
    case 'container':
      return <Container className="h-4 w-4" />;
    case 'script':
      return <FileCode className="h-4 w-4" />;
    case 'suspend':
      return <Clock className="h-4 w-4" />;
  }
}

function getTeamTypeIcon(type: TeamStepType) {
  switch (type) {
    case 'orchestrator':
      return <Users className="h-4 w-4" />;
    case 'agent':
      return <Bot className="h-4 w-4" />;
    case 'delegation':
      return <GitBranch className="h-4 w-4" />;
    case 'tool-call':
      return <Workflow className="h-4 w-4" />;
    case 'response':
      return <MessageSquare className="h-4 w-4" />;
  }
}

function getSessionTypeIcon(type: SessionType) {
  switch (type) {
    case 'workflow':
      return <Workflow className="h-4 w-4" />;
    case 'team':
      return <Users className="h-4 w-4" />;
    case 'agent':
      return <Bot className="h-4 w-4" />;
  }
}

function getStatusBadgeVariant(
  status: StepStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'succeeded':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'secondary';
    default:
      return 'outline';
  }
}

function WorkflowStepDetail({ detail, message }: { detail: WorkflowStepDetail; message?: string }) {
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  
  const shouldFetchLogs = detail.workflowName && detail.nodeId && detail.namespace;

  useEffect(() => {
    if (shouldFetchLogs) {
      const fetchLogs = async () => {
        setLoadingLogs(true);
        setLogsError(null);
        try {
          const { workflowsService } = await import('@/lib/services/workflows');
          const logData = await workflowsService.getWorkflowLogs(
            detail.workflowName!,
            detail.nodeId!,
            detail.namespace!,
          );
          setLogs(logData);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('404')) {
            setShowLogs(false);
          } else {
            setLogsError('Failed to load logs');
          }
        } finally {
          setLoadingLogs(false);
        }
      };
      void fetchLogs();
    }
  }, [detail.workflowName, detail.nodeId, detail.namespace, shouldFetchLogs]);
  return (
    <div className="bg-muted/30 mt-2 space-y-3 rounded-md border p-3 text-sm">
      {detail.image && (
        <div className="flex items-start gap-2">
          <Container className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div>
            <span className="text-muted-foreground text-xs">Image</span>
            <p className="font-mono text-xs">{detail.image}</p>
          </div>
        </div>
      )}

      {detail.command && (
        <div className="flex items-start gap-2">
          <Terminal className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div>
            <span className="text-muted-foreground text-xs">Command</span>
            <p className="font-mono text-xs">
              {detail.command.join(' ')} {detail.args?.join(' ')}
            </p>
          </div>
        </div>
      )}

      {detail.inputs && Object.keys(detail.inputs).length > 0 && (
        <div className="flex items-start gap-2">
          <FileText className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Inputs</span>
            <div className="bg-background mt-1 rounded border p-2">
              {Object.entries(detail.inputs).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="text-muted-foreground">{key}:</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {detail.outputs && Object.keys(detail.outputs).length > 0 && (
        <div className="flex items-start gap-2">
          <Zap className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Outputs</span>
            <div className="bg-background mt-1 rounded border p-2">
              {Object.entries(detail.outputs).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="text-muted-foreground">{key}:</span>
                  <span>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2">
          <AlertCircle className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Message</span>
            <div className="bg-background mt-1 rounded border p-2">
              <div className="flex gap-2 font-mono text-xs">
                <span>{message}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {shouldFetchLogs && showLogs && (
        <div className="flex items-start gap-2">
          <Terminal className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Logs</span>
            <div className="bg-black mt-1 max-h-64 overflow-auto rounded border p-3">
              {loadingLogs && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="font-mono text-xs">Loading logs...</span>
                </div>
              )}
              {logsError && (
                <div className="font-mono text-xs text-red-400">{logsError}</div>
              )}
              {logs && !loadingLogs && (
                <pre className="font-mono text-xs whitespace-pre-wrap">
                  {logs}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {detail.resources && (
        <div className="flex items-center gap-4">
          {detail.resources.cpu && (
            <div className="flex items-center gap-1">
              <Cpu className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-xs">CPU:</span>
              <span className="text-xs">{detail.resources.cpu}</span>
            </div>
          )}
          {detail.resources.memory && (
            <div className="flex items-center gap-1">
              <HardDrive className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-xs">Memory:</span>
              <span className="text-xs">{detail.resources.memory}</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function TeamStepDetail({ detail }: { detail: TeamStepDetail }) {
  return (
    <div className="bg-muted/30 mt-2 space-y-3 rounded-md border p-3 text-sm">
      {detail.model && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Bot className="text-muted-foreground h-3 w-3" />
            <span className="text-muted-foreground text-xs">Model:</span>
            <span className="text-xs font-medium">{detail.model}</span>
          </div>
          {detail.tokensUsed && (
            <div className="flex items-center gap-1">
              <Zap className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-xs">Tokens:</span>
              <span className="text-xs">
                {detail.tokensUsed.input.toLocaleString()} in /{' '}
                {detail.tokensUsed.output.toLocaleString()} out
              </span>
            </div>
          )}
        </div>
      )}

      {detail.input && (
        <div className="flex items-start gap-2">
          <MessageSquare className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Input</span>
            <div className="bg-background mt-1 rounded border p-2">
              <p className="text-xs whitespace-pre-wrap">{detail.input}</p>
            </div>
          </div>
        </div>
      )}

      {detail.thinking && (
        <div className="flex items-start gap-2">
          <Bot className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Thinking</span>
            <div className="bg-background mt-1 rounded border border-blue-200 p-2 dark:border-blue-800">
              <p className="text-xs text-blue-600 italic dark:text-blue-400">
                {detail.thinking}
              </p>
            </div>
          </div>
        </div>
      )}

      {detail.toolInput && (
        <div className="flex items-start gap-2">
          <Workflow className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Tool Input</span>
            <div className="bg-background mt-1 rounded border p-2">
              <pre className="overflow-auto text-xs">
                {JSON.stringify(detail.toolInput, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {detail.toolOutput !== undefined && (
        <div className="flex items-start gap-2">
          <Zap className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Tool Output</span>
            <div className="bg-background mt-1 rounded border p-2">
              <pre className="overflow-auto text-xs">
                {JSON.stringify(detail.toolOutput, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {detail.output && (
        <div className="flex items-start gap-2">
          <MessageSquare className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Output</span>
            <div className="bg-background mt-1 rounded border border-green-200 p-2 dark:border-green-800">
              <p className="text-xs whitespace-pre-wrap">{detail.output}</p>
            </div>
          </div>
        </div>
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

  const getBorderColor = () => {
    if (step.status === 'running') return 'border-l-blue-500';
    if (step.status === 'succeeded') return 'border-l-green-500';
    if (step.status === 'failed') return 'border-l-red-500';
    return 'border-l-gray-300 dark:border-l-gray-700';
  };

  return (
    <div className={cn('relative flex gap-2', depth > 0 && 'ml-4')}>
      {depth > 0 && (
        <>
          <div className="absolute -left-4 top-0 flex h-full w-4 flex-col items-center">
            <div className="bg-border mt-5 w-px flex-1" style={{ display: isLast ? 'none' : 'block' }} />
          </div>
          <div className="bg-border absolute -left-4 top-5 h-px w-4" />
        </>
      )}

      <div className="flex-1">
        <div
          className={cn(
            'hover:bg-muted/50 group relative flex items-center gap-2 rounded-lg border border-l-2 bg-card p-2.5 shadow-sm transition-all',
            getBorderColor(),
            step.status === 'running' && 'bg-blue-50/50 dark:bg-blue-950/20',
            step.status === 'failed' && 'bg-red-50/50 dark:bg-red-950/20',
          )}>
          {hasDetail ? (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="hover:bg-muted -m-1 rounded p-1 transition-colors"
              aria-label={showDetail ? 'Hide details' : 'Show details'}>
              {showDetail ? (
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronRight className="text-muted-foreground h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {getStatusIcon(step.status)}
            <div className="text-muted-foreground shrink-0">
              {getWorkflowTypeIcon(step.type)}
            </div>
            <span className="truncate font-medium">{step.displayName}</span>
            {step.name !== step.displayName && (
              <span className="text-muted-foreground truncate text-xs">
                ({step.name})
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {step.duration && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {step.duration}
              </span>
            )}

            <Badge
              variant={getStatusBadgeVariant(step.status)}
              className="text-xs">
              {step.status}
            </Badge>
          </div>
        </div>

        {hasDetail && showDetail && (
          <div className="ml-6 mt-2">
            <WorkflowStepDetail detail={step.detail!} message={step.message} />
          </div>
        )}

        {hasChildren && (
          <div className="mt-2 space-y-2">
            {step.children!.map((child, index) => (
              <WorkflowStepNode
                key={child.id}
                step={child}
                depth={depth + 1}
                isLast={index === step.children!.length - 1}
              />
            ))}
          </div>
        )}
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

  const getBorderColor = () => {
    if (step.status === 'running') return 'border-l-blue-500';
    if (step.status === 'succeeded') return 'border-l-green-500';
    if (step.status === 'failed') return 'border-l-red-500';
    return 'border-l-gray-300 dark:border-l-gray-700';
  };

  return (
    <div className={cn('relative flex gap-2', depth > 0 && 'ml-4')}>
      {depth > 0 && (
        <>
          <div className="absolute -left-4 top-0 flex h-full w-4 flex-col items-center">
            <div className="bg-border mt-5 w-px flex-1" style={{ display: isLast ? 'none' : 'block' }} />
          </div>
          <div className="bg-border absolute -left-4 top-5 h-px w-4" />
        </>
      )}

      <div className="flex-1">
        <div
          className={cn(
            'hover:bg-muted/50 group relative flex items-center gap-2 rounded-lg border border-l-2 bg-card p-2.5 shadow-sm transition-all',
            getBorderColor(),
            step.status === 'running' && 'bg-blue-50/50 dark:bg-blue-950/20',
            step.status === 'failed' && 'bg-red-50/50 dark:bg-red-950/20',
          )}>
          {hasDetail ? (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="hover:bg-muted -m-1 rounded p-1 transition-colors"
              aria-label={showDetail ? 'Hide details' : 'Show details'}>
              {showDetail ? (
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronRight className="text-muted-foreground h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {getStatusIcon(step.status)}
            <div className="text-muted-foreground shrink-0">
              {getTeamTypeIcon(step.type)}
            </div>
            <span className="truncate font-medium">{step.displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              ({step.agentName})
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {step.message && (
              <span className="text-muted-foreground max-w-[200px] truncate text-xs">
                {step.message}
              </span>
            )}

            {step.duration && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {step.duration}
              </span>
            )}

            <Badge
              variant={getStatusBadgeVariant(step.status)}
              className="text-xs">
              {step.status}
            </Badge>
          </div>
        </div>

        {hasDetail && showDetail && (
          <div className="ml-6 mt-2">
            <TeamStepDetail detail={step.detail!} />
          </div>
        )}

        {hasChildren && (
          <div className="mt-2 space-y-2">
            {step.children!.map((child, index) => (
              <TeamStepNode
                key={child.id}
                step={child}
                depth={depth + 1}
                isLast={index === step.children!.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetailView({
  session,
  isLoading = false
}: {
  session: Session;
  isLoading?: boolean;
}) {
  return (
    <Card className="min-h-0 flex-1 overflow-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">
              {getSessionTypeIcon(session.type)}
            </div>
            <CardTitle>{session.name}</CardTitle>
            <Badge variant={getStatusBadgeVariant(session.status)}>
              {session.status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {session.type}
            </Badge>
            {isLoading && (
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {session.duration}
            </span>
            <span>Started: {new Date(session.startedAt).toLocaleString()}</span>
            {session.type === 'workflow' && session.namespace && session.uid && (
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="h-8 w-8"
              >
                <a
                  href={`http://argo.127.0.0.1.nip.io:8080/workflows/${session.namespace}/${session.name}?uid=${session.uid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View in Argo Workflows"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {session.type === 'workflow'
            ? session.steps.map(step => (
              <WorkflowStepNode key={step.id} step={step} />
            ))
            : session.steps.map(step => (
              <TeamStepNode key={step.id} step={step} />
            ))}
        </div>
      </CardContent>
    </Card>
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
      onClick={onClick}
      className={cn(
        'hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors',
        isSelected && 'bg-muted border-primary',
      )}>
      <div className="text-muted-foreground">
        {getSessionTypeIcon(session.type)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{session.name}</span>
          <Badge
            variant={getStatusBadgeVariant(session.status)}
            className="text-xs">
            {session.status}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>{session.type}</span>
          <span>·</span>
          <span>{session.duration}</span>
          <span>·</span>
          <span>{new Date(session.startedAt).toLocaleTimeString()}</span>
        </div>
      </div>
      {getStatusIcon(session.status)}
    </button>
  );
}

const normalizeStatus = (status: string): string => {
  if (!status || status === 'all') return 'all';
  
  const statusMap: Record<string, string> = {
    'running': 'Running',
    'succeeded': 'Succeeded',
    'failed': 'Failed',
    'error': 'Error',
    'pending': 'Pending',
  };
  
  return statusMap[status.toLowerCase()] || status;
};

export function SessionsSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [sourceFilter, setSourceFilter] = useState<SessionSourceFilter>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [useRealData, setUseRealData] = useState(true);

  const [workflowNameInput, setWorkflowNameInput] = useState(
    searchParams.get('workflowName') || ''
  );
  const [workflowTemplateNameInput, setWorkflowTemplateNameInput] = useState(
    searchParams.get('workflowTemplateName') || ''
  );
  const [statusFilter, setStatusFilter] = useState(
    normalizeStatus(searchParams.get('status') || 'all')
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (searchParams.get('sort') as SortOrder) || 'newest'
  );

  const debouncedWorkflowName = useDebounce(workflowNameInput, 500);
  const debouncedWorkflowTemplateName = useDebounce(workflowTemplateNameInput, 500);

  const filters = useMemo(() => ({
    workflowName: debouncedWorkflowName || undefined,
    workflowTemplateName: debouncedWorkflowTemplateName || undefined,
    status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
  }), [debouncedWorkflowName, debouncedWorkflowTemplateName, statusFilter]);

  // Update URL when filters or sort change
  useEffect(() => {
    const params = new URLSearchParams();
    
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
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [debouncedWorkflowName, debouncedWorkflowTemplateName, statusFilter, sortOrder, router]);

  const { workflows, loading, error, refetch: refetchWorkflows } = useWorkflows('default', filters);

  const allSessions = mapArgoWorkflowsToSessions(workflows);

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

  const selectedSessionFromList = filteredAndSortedSessions.find(s => s.id === selectedSessionId);

  const { workflow: selectedWorkflowDetail, loading: loadingDetail } = useWorkflow(
    useRealData && selectedSessionFromList?.type === 'workflow' ? selectedSessionId || '' : '',
    'default',
  );

  const selectedSession =
    useRealData && selectedWorkflowDetail
      ? mapArgoWorkflowToSession(selectedWorkflowDetail)
      : selectedSessionFromList;

  const previousStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (selectedWorkflowDetail && useRealData) {
      const currentStatus = selectedWorkflowDetail.status.phase;
      const previousStatus = previousStatusRef.current;

      const isTerminalState =
        currentStatus === 'Succeeded' ||
        currentStatus === 'Failed' ||
        currentStatus === 'Error';

      const wasRunning = previousStatus === 'Running' || previousStatus === 'Pending';

      if (isTerminalState && wasRunning) {
        void refetchWorkflows();
      }

      previousStatusRef.current = currentStatus;
    }
  }, [selectedWorkflowDetail, useRealData, refetchWorkflows]);

  const hasActiveFilters = workflowNameInput || workflowTemplateNameInput || (statusFilter && statusFilter !== 'all') || sortOrder !== 'newest';

  const clearFilters = () => {
    setWorkflowNameInput('');
    setWorkflowTemplateNameInput('');
    setStatusFilter('all');
    setSortOrder('newest');
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Filter by workflow name..."
              value={workflowNameInput}
              onChange={e => setWorkflowNameInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Filter by template name..."
              value={workflowTemplateNameInput}
              onChange={e => setWorkflowTemplateNameInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter || 'all'} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Running">Running</SelectItem>
              <SelectItem value="Succeeded">Succeeded</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              title="Clear all filters"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Select value={sortOrder} onValueChange={value => setSortOrder(value as SortOrder)}>
            <SelectTrigger className="w-40">
              <ArrowUpDown className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
          {loading && (
            <span className="text-muted-foreground text-sm">Loading...</span>
          )}
          {error && (
            <span className="text-sm text-red-500">
              Error: {error.message}
            </span>
          )}
          <span className="text-muted-foreground text-sm">
            {filteredAndSortedSessions.length} session
            {filteredAndSortedSessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span>Loading sessions...</span>
        </div>
      ) : filteredAndSortedSessions.length > 0 ? (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="flex w-80 flex-col gap-2 overflow-auto">
            {filteredAndSortedSessions.map(session => (
              <SessionListItem
                key={session.id}
                session={session}
                isSelected={session.id === selectedSessionId}
                onClick={() => setSelectedSessionId(session.id)}
              />
            ))}
          </div>
          <div className="flex flex-1 overflow-hidden">
            {selectedSession ? (
              <SessionDetailView
                session={selectedSession}
                isLoading={loadingDetail && useRealData}
              />
            ) : (
              <div className="text-muted-foreground flex flex-1 items-center justify-center">
                Select a session to view details
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
          {hasActiveFilters ? (
            <>
              <Search className="h-12 w-12 opacity-20" />
              <span>No sessions found matching your filters</span>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </>
          ) : (
            <span>No {sourceFilter === 'all' ? '' : sourceFilter} sessions to display</span>
          )}
        </div>
      )}
    </div>
  );
}
