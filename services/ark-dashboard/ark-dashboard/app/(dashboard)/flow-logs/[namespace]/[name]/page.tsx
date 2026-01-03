'use client';

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { getArgoBaseUrl } from '@/lib/services/flows';
import type { WorkflowDetail, WorkflowNode } from '@/lib/types/flow';

type PhaseType = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Error';

const phaseIcons: Record<PhaseType, React.ReactNode> = {
  Pending: <Clock className="h-5 w-5 text-gray-500" />,
  Running: <Loader2 className="h-5 w-5 animate-spin text-blue-500" />,
  Succeeded: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  Failed: <XCircle className="h-5 w-5 text-red-500" />,
  Error: <XCircle className="h-5 w-5 text-red-500" />,
};

function isSystemLog(line: string): boolean {
  return (
    line.startsWith('query.ark.') ||
    line.includes(' created') ||
    line.includes(' condition met') ||
    line.includes('completed:') ||
    line.includes('written to') ||
    line.includes('level=info') ||
    line.includes('sub-process exited') ||
    line.startsWith('time=')
  );
}

interface ParsedLog {
  time?: string;
  level?: string;
  message: string;
  error?: string;
}

function parseSystemLog(line: string): ParsedLog {
  const timeMatch = line.match(/time="([^"]+)"/);
  const levelMatch = line.match(/level=(\w+)/);
  const msgMatch = line.match(/msg="([^"]+)"/);
  const errorMatch = line.match(/error="([^"]+)"/);

  if (timeMatch || msgMatch) {
    return {
      time: timeMatch ? timeMatch[1] : undefined,
      level: levelMatch ? levelMatch[1] : undefined,
      message: msgMatch ? msgMatch[1] : line,
      error: errorMatch ? errorMatch[1] : undefined,
    };
  }

  return { message: line };
}

function SystemLogLine({ line }: { line: string }) {
  const parsed = parseSystemLog(line);

  if (parsed.time) {
    const time = new Date(parsed.time).toLocaleTimeString();
    const hasError = parsed.error && parsed.error !== '<nil>';

    return (
      <div className="flex items-start gap-3 py-1">
        <span className="shrink-0 text-white">{time}</span>
        <span className="text-gray-300">{parsed.message}</span>
        {hasError && (
          <span className="text-red-400">Error: {parsed.error}</span>
        )}
      </div>
    );
  }

  return <div className="py-1 text-gray-300">{parsed.message}</div>;
}

function StepLogs({
  node,
  logs,
  defaultExpanded,
}: {
  node: WorkflowNode;
  logs: string[];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [viewRaw, setViewRaw] = useState(false);
  const phase = node.phase as PhaseType;
  const icon = phaseIcons[phase] || phaseIcons.Pending;

  const duration =
    node.startedAt && node.finishedAt
      ? Math.round(
          (new Date(node.finishedAt).getTime() -
            new Date(node.startedAt).getTime()) /
            1000,
        )
      : null;

  const systemLogs = logs.filter(l => isSystemLog(l));
  const contentLogs = logs.filter(l => !isSystemLog(l) && l.trim() !== '');

  const outputParamName = node.outputs?.parameters?.[0]?.name;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900/30">
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
        {icon}
        <span className="flex-1 font-medium">{node.displayName}</span>
        <span className="text-muted-foreground text-sm">
          {duration !== null ? `${duration}s` : '-'}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            phase === 'Succeeded'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : phase === 'Failed' || phase === 'Error'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : phase === 'Running'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
          }`}>
          {phase}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 p-4">
          {systemLogs.length > 0 && (
            <div className="rounded border border-gray-700 bg-gray-900 p-3">
              <div className="mb-2 text-sm font-semibold text-gray-200">
                System Logs
              </div>
              <div className="font-mono text-xs">
                {systemLogs.map((line, i) => (
                  <SystemLogLine key={i} line={line} />
                ))}
              </div>
            </div>
          )}

          {contentLogs.length > 0 && (
            <div className="rounded border bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Step Output
                  <span className="ml-2 font-mono text-xs font-normal text-gray-500">
                    {outputParamName
                      ? `(output reference: ${node.displayName}.outputs.parameters.${outputParamName})`
                      : '(no named output)'}
                  </span>
                </div>
                <button
                  onClick={() => setViewRaw(!viewRaw)}
                  className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">
                  {viewRaw ? 'View Formatted' : 'View Raw'}
                </button>
              </div>
              {viewRaw ? (
                <pre className="max-h-[500px] overflow-auto font-mono text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                  {contentLogs.join('\n')}
                </pre>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{contentLogs.join('\n')}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {logs.length === 0 && (
            <p className="text-muted-foreground text-sm italic">
              No logs available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkflowDetailPage() {
  const params = useParams();
  const namespace = params.namespace as string;
  const name = params.name as string;

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [argoBaseUrl, setArgoBaseUrl] = useState('http://localhost:2746');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const baseUrl = await getArgoBaseUrl();
        setArgoBaseUrl(baseUrl);

        const response = await fetch(
          `/api/argo/workflows/${namespace}/${name}`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch workflow');
        }
        const data = await response.json();
        setWorkflow(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [namespace, name]);

  const breadcrumbs: BreadcrumbElement[] = [
    { href: '/', label: 'ARK Dashboard' },
    { href: '/flow-logs', label: 'Flow Logs' },
  ];

  const getLogsForNode = (node: WorkflowNode): string[] => {
    if (!workflow?.logsByPod) return [];

    for (const [podName, logs] of Object.entries(workflow.logsByPod)) {
      if (podName.includes(node.id.split('-').pop() || '')) {
        return logs;
      }
    }
    return [];
  };

  if (loading) {
    return (
      <>
        <PageHeader breadcrumbs={breadcrumbs} currentPage="Loading..." />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      </>
    );
  }

  if (error || !workflow) {
    return (
      <>
        <PageHeader breadcrumbs={breadcrumbs} currentPage="Error" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-red-500">{error || 'Workflow not found'}</p>
          <Link href="/flow-logs">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Flow Logs
            </Button>
          </Link>
        </div>
      </>
    );
  }

  const phase = workflow.phase as PhaseType;
  const icon = phaseIcons[phase] || phaseIcons.Pending;

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage={workflow.name}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              window.open(
                `${argoBaseUrl}/workflows/${namespace}/${name}`,
                '_blank',
              )
            }>
            <ExternalLink className="mr-2 h-4 w-4" />
            View in Argo
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-4 rounded-lg border p-4">
          {icon}
          <div className="flex-1">
            <h2 className="font-mono text-lg font-semibold">{workflow.name}</h2>
            <p className="text-muted-foreground text-sm">
              Template: {workflow.templateName || '-'} • Namespace:{' '}
              {workflow.namespace}
            </p>
          </div>
          <div
            className={`rounded px-3 py-1 text-sm font-medium ${
              phase === 'Succeeded'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : phase === 'Failed' || phase === 'Error'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  : phase === 'Running'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}>
            {phase}
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-lg border">
          <div className="border-b bg-gray-50 px-4 py-2 dark:bg-gray-900/50">
            <h3 className="font-medium">Steps ({workflow.nodes.length})</h3>
          </div>

          {workflow.nodes.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center">
              No steps found
            </div>
          ) : (
            workflow.nodes.map((node, index) => (
              <StepLogs
                key={node.id}
                node={node}
                logs={getLogsForNode(node)}
                defaultExpanded={index === 0}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
