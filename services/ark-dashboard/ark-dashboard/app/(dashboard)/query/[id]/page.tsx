'use client';

import { Copy } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ErrorResponseContent } from '@/components/ErrorResponseContent';
import JsonDisplay from '@/components/JsonDisplay';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { QueryEvaluationActions } from '@/components/query-actions';
import { QueryMemoryField } from '@/components/query-fields/query-memory-field';
import { QueryTargetsField } from '@/components/query-fields/query-targets-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { components } from '@/lib/api/generated/types';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { useMarkdownProcessor } from '@/lib/hooks/use-markdown-processor';
import {
  agentsService,
  evaluationsService,
  memoriesService,
  modelsService,
  teamsService,
  toolsService,
} from '@/lib/services';
import { queriesService } from '@/lib/services/queries';
import type { ToolDetail } from '@/lib/services/tools';
import { simplifyDuration } from '@/lib/utils/time';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/queries', label: 'Queries' },
];

// Component for rendering response content
function ResponseContent({
  content,
  viewMode,
  rawJson,
}: {
  content: string;
  viewMode: 'content' | 'text' | 'markdown' | 'raw';
  rawJson?: unknown;
}) {
  const markdownContent = useMarkdownProcessor(content);

  if (viewMode === 'raw') {
    const getJsonDisplay = () => {
      if (
        rawJson &&
        typeof rawJson === 'object' &&
        (rawJson as { raw?: string }).raw
      ) {
        try {
          const parsed = JSON.parse((rawJson as { raw?: string }).raw!);
          // Create a more readable structure
          const readableJson = {
            content: (rawJson as { content?: string }).content || 'No content',
            target:
              (rawJson as { target?: { name?: string; type?: string } })
                .target || 'No target',
            raw: parsed,
          };
          return readableJson;
        } catch {
          return rawJson;
        }
      }
      return rawJson;
    };

    return (
      <div className="text-sm">
        <JsonDisplay
          value={getJsonDisplay()}
          className="rounded bg-black p-4 font-mono text-sm break-words whitespace-pre-wrap text-white"
        />
      </div>
    );
  }

  if (viewMode === 'content') {
    return <div className="text-sm">{markdownContent}</div>;
  }

  if (viewMode === 'text') {
    return (
      <pre className="bg-gray-50 p-3 font-mono text-sm whitespace-pre-wrap text-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
        {content || 'No content'}
      </pre>
    );
  }

  return (
    <pre className="bg-gray-50 p-3 font-mono text-sm whitespace-pre-wrap text-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
      {content || 'No content'}
    </pre>
  );
}

type QueryDetailResponse = components['schemas']['QueryDetailResponse'];

// Proper typing for query status based on CRD structure
interface QueryStatus {
  phase?: string;
  response?: {
    target?: {
      type: string;
      name: string;
    };
    content?: string;
  };
  evaluations?: Array<{
    evaluatorName?: string;
    score?: string;
    passed?: boolean;
    metadata?: Record<string, string>;
  }>;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

interface TypedQueryDetailResponse
  extends Omit<QueryDetailResponse, 'status' | 'targets'> {
  status?: QueryStatus | null;
  metadata?: Record<string, string>;
  target?: { name: string; type: string };
}

// Reusable styles for table field headings
const FIELD_HEADING_STYLES =
  'px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left';

interface QueryFieldProps {
  mode: 'new' | 'view';
  value: string | null | undefined;
  onChange?: (value: string) => void;
  label: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  tooltip?: string;
}

function QueryDurationField({
  mode,
  value,
  onChange,
  label,
  placeholder,
  inputRef,
  tooltip,
}: QueryFieldProps) {
  if (mode === 'new') {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800">
        <td className={FIELD_HEADING_STYLES}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
                {label}
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-3 py-2">
          <Input
            ref={inputRef}
            value={value || ''}
            onChange={e => onChange?.(e.target.value)}
            placeholder={placeholder}
            className="text-xs"
          />
        </td>
      </tr>
    );
  }

  // View mode - use simplifyDuration for duration values
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
        {simplifyDuration(value)}
      </td>
    </tr>
  );
}

function QueryNameField({
  mode,
  value,
  onChange,
  label,
  placeholder,
  inputRef,
  tooltip,
}: QueryFieldProps) {
  if (mode === 'new') {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800">
        <td className={FIELD_HEADING_STYLES}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
                {label}
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {tooltip ||
                    'Identifier of the query, must be unique in the namespace'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-3 py-2">
          <Input
            ref={inputRef}
            value={value || ''}
            onChange={e => onChange?.(e.target.value)}
            placeholder={placeholder || 'Enter query name'}
            className="text-xs"
          />
        </td>
      </tr>
    );
  }

  // View mode - existing display
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {tooltip ||
                  'Identifier of the query, must be unique in the namespace'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
        {value || '—'}
      </td>
    </tr>
  );
}

interface QueryStreamingFieldProps {
  mode: 'new' | 'view';
  value: boolean;
  onChange?: (value: boolean) => void;
  label: string;
  tooltip?: string;
  metadata?: { annotations?: Record<string, string> };
}

function QueryStreamingField({
  mode,
  value,
  onChange,
  label,
  tooltip,
  metadata,
}: QueryStreamingFieldProps) {
  // For view mode, check if streaming annotation exists
  const isStreamingEnabled =
    mode === 'view'
      ? metadata?.annotations?.[ARK_ANNOTATIONS.STREAMING_ENABLED] === 'true'
      : value;

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {tooltip ||
                  'Enable real-time streaming for live response updates'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2">
        {mode === 'view' ? (
          <span className="text-xs text-gray-700 dark:text-gray-300">
            {isStreamingEnabled ? 'Yes' : 'No'}
          </span>
        ) : (
          <Checkbox
            id="streaming"
            checked={isStreamingEnabled}
            onCheckedChange={onChange}
          />
        )}
      </td>
    </tr>
  );
}

function QueryDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryId = params.id as string;
  const targetTool = searchParams.get('target_tool');
  const isNew = queryId === 'new';
  const mode = isNew ? 'new' : 'view';

  const [query, setQuery] = useState<TypedQueryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluationCount, setEvaluationCount] = useState(0);
  const [availableTargets, setAvailableTargets] = useState<
    Array<{ name: string; type: 'agent' | 'model' | 'team' | 'tool' }>
  >([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [availableMemories, setAvailableMemories] = useState<
    Array<{ name: string }>
  >([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [responseViewMode, setResponseViewMode] = useState<'content' | 'raw'>(
    'content',
  );
  const [errorViewMode, setErrorViewMode] = useState<'events' | 'details'>(
    'events',
  );
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const [toolSchema, setToolSchema] = useState<ToolDetail | null>(null);
  const [streaming, setStreaming] = useState(false);

  // Copy schema to clipboard
  const copySchemaToClipboard = async () => {
    if (!toolSchema?.spec?.inputSchema) return;

    const schemaText = getSchemaExample(toolSchema.spec.inputSchema) || '{}';
    try {
      await navigator.clipboard.writeText(schemaText);
      toast('Copied to clipboard', {
        description: 'Input schema template has been copied',
      });
    } catch {
      toast.error('Copy failed', {
        description: 'Could not copy to clipboard',
      });
    }
  };

  // Extract example from JSON schema
  const getSchemaExample = (schema: Record<string, unknown>): string | null => {
    // Look for explicit examples
    if (schema.example) {
      return typeof schema.example === 'string'
        ? schema.example
        : JSON.stringify(schema.example, null, 2);
    }

    // Look for examples in properties or generate empty structure
    if (schema.type === 'object' && schema.properties) {
      const properties = schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      const example: Record<string, unknown> = {};

      for (const [key, prop] of Object.entries(properties)) {
        if (prop.example !== undefined) {
          example[key] = prop.example;
        } else if (prop.default !== undefined) {
          example[key] = prop.default;
        } else {
          // Generate empty placeholder based on type
          if (prop.type === 'string') {
            example[key] = '';
          } else if (prop.type === 'number' || prop.type === 'integer') {
            example[key] = 0;
          } else if (prop.type === 'boolean') {
            example[key] = false;
          } else if (prop.type === 'array') {
            example[key] = [];
          } else if (prop.type === 'object') {
            example[key] = {};
          } else {
            example[key] = null;
          }
        }
      }

      // Only return structure if there are properties to show
      if (Object.keys(example).length > 0) {
        return JSON.stringify(example, null, 2);
      }
    }

    return null;
  };

  const handleSaveQuery = async () => {
    if (!query) return;

    // Validate required fields
    if (!query.target) {
      toast.error('Missing Target', {
        description:
          'Please select a target (agent, model, team, or tool) to execute the query.',
      });
      // TODO: Focus target field
      return;
    }

    setSaving(true);
    try {
      // Auto-generate name if empty
      let queryName = query.name?.trim();
      if (!queryName) {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomValue = window.crypto.getRandomValues(
          new Uint32Array(1),
        )[0];
        const randomSuffix = (randomValue % 900000) + 100000;
        queryName = `ark-${dateStr}-${randomSuffix}`;
      }

      // Prepare the query data for the API
      const queryData = {
        name: queryName,
        type: Array.isArray(query.input)
          ? ('messages' as const)
          : ('user' as const),
        input: query.input || '',
        target: query.target,
        timeout: query.timeout,
        ttl: query.ttl,
        sessionId: query.sessionId,
        memory: query.memory,
        ...(streaming && {
          metadata: {
            [ARK_ANNOTATIONS.STREAMING_ENABLED]: 'true',
          },
        }),
      };

      const savedQuery = await queriesService.create(queryData);

      toast('Query Executed', {
        description: `Query "${savedQuery.name}" has been created and is now executing.`,
      });

      // Navigate to the created query
      router.push(`/query/${savedQuery.name}`);
    } catch (error) {
      console.error('Failed to save query:', error);
      toast.error('Failed to Execute Query', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setSaving(false);
    }
  };

  // Focus name field when in new mode
  useEffect(() => {
    if (isNew && nameFieldRef.current && !loading) {
      nameFieldRef.current.focus();
    }
  }, [isNew, loading]);

  useEffect(() => {
    if (isNew) {
      // For new queries, initialize with empty object
      setQuery({
        name: '',
        namespace: '',
        type: 'user',
        input: '',
        target: undefined,
        status: null,
      } as TypedQueryDetailResponse);
      setLoading(false);

      // Load available targets and memories for new queries
      const loadResources = async () => {
        setTargetsLoading(true);
        setMemoriesLoading(true);
        try {
          const [agents, models, teams, tools, memories] = await Promise.all([
            agentsService.getAll(),
            modelsService.getAll(),
            teamsService.getAll(),
            toolsService.getAll(),
            memoriesService.getAll(),
          ]);

          const targets = [
            ...agents.map(a => ({ name: a.name, type: 'agent' as const })),
            ...models.map(m => ({ name: m.name, type: 'model' as const })),
            ...teams.map(t => ({ name: t.name, type: 'team' as const })),
            ...tools.map(t => ({ name: t.name, type: 'tool' as const })),
          ];

          setAvailableTargets(targets);
          setAvailableMemories(memories.map(m => ({ name: m.name })));

          // If target_tool param is present, auto-select that tool as target
          if (targetTool) {
            const foundTool = targets.find(
              t => t.type === 'tool' && t.name === targetTool,
            );
            if (foundTool) {
              setQuery(prev => (prev ? { ...prev, target: foundTool } : null));
            }
          }
        } catch (error) {
          console.error('Failed to load resources:', error);
          toast.error('Failed to Load Resources', {
            description:
              'Could not load available agents, models, teams, tools, and memories',
          });
        } finally {
          setTargetsLoading(false);
          setMemoriesLoading(false);
        }
      };

      loadResources();
      return;
    }

    const loadQuery = async () => {
      try {
        const queryData = await queriesService.get(queryId);
        setQuery(queryData as TypedQueryDetailResponse);

        // Set streaming state based on annotation
        const isStreamingEnabled =
          (queryData as TypedQueryDetailResponse).metadata?.[
            ARK_ANNOTATIONS.STREAMING_ENABLED
          ] === 'true';
        setStreaming(isStreamingEnabled);

        // Load evaluation count
        try {
          const evaluationSummary =
            await evaluationsService.getEvaluationSummary(queryId);
          setEvaluationCount(evaluationSummary.total || 0);
        } catch (error) {
          console.error('Failed to load evaluation count:', error);
          setEvaluationCount(0);
        }
      } catch (error) {
        toast.error('Failed to Load Query', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setLoading(false);
      }
    };

    loadQuery();
  }, [queryId, isNew, targetTool]);

  // Fetch tool schema when target is a tool
  useEffect(() => {
    if (query?.target?.type === 'tool') {
      const toolName = query.target.name;
      toolsService
        .getDetail(toolName)
        .then(setToolSchema)
        .catch(() => setToolSchema(null)); // Silent failure
    } else {
      setToolSchema(null);
    }
  }, [query?.target]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading query...</div>
      </div>
    );
  }

  if (!query) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold">Query Not Found</h1>
          <Button variant="outline" onClick={() => router.back()}>
            ← Back to Queries
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage={isNew ? 'New Query' : query.name}
        actions={
          <>
            {!isNew && <QueryEvaluationActions queryName={queryId} />}
            {isNew && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/query/new`)}>
                  New Query
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveQuery}
                  disabled={saving}>
                  {saving ? 'Executing...' : 'Execute Query'}
                </Button>
              </>
            )}
            {!isNew && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/query/new`)}>
                New Query
              </Button>
            )}
          </>
        }
      />
      <div className="flex h-full flex-col">
        {/* Query Details - Three Column Layout */}
        <div className="border-b bg-gray-50/30 px-4 py-3 dark:bg-gray-900/10">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {/* Query Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Query
                  </h3>
                  <a
                    href={`/events?kind=Query&name=${query.name}`}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    target="_blank"
                    rel="noopener noreferrer">
                    View Events
                  </a>
                </div>
              </div>
              <table className="w-full table-fixed">
                <tbody>
                  <QueryNameField
                    mode={mode}
                    value={query.name}
                    onChange={name =>
                      setQuery(prev => (prev ? { ...prev, name } : null))
                    }
                    label="Name"
                    placeholder="Default: Auto-generated"
                    inputRef={nameFieldRef}
                  />
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="w-1/3 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-400 dark:bg-gray-900/50 dark:text-gray-600">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            className="cursor-help text-left"
                            tabIndex={-1}>
                            Svc. Account
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Kubernetes ServiceAccount used for RBAC
                              permissions during query execution
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">
                      {query.serviceAccount || '—'}
                    </td>
                  </tr>
                  <QueryTargetsField
                    mode={mode}
                    value={query.target ? [query.target] : []}
                    onChange={targets =>
                      setQuery(prev =>
                        prev ? { ...prev, target: targets[0] } : null,
                      )
                    }
                    label="Target"
                    availableTargets={availableTargets}
                    loading={targetsLoading}
                  />
                  <QueryNameField
                    mode={mode}
                    value={query.sessionId}
                    onChange={sessionId =>
                      setQuery(prev => (prev ? { ...prev, sessionId } : null))
                    }
                    label="Session ID"
                    placeholder="Default: Auto-generated"
                    tooltip="Identifier for grouping related queries, used for conversation memory"
                  />
                </tbody>
              </table>
            </div>

            {/* Configuration Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Configuration
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <QueryDurationField
                    mode={mode}
                    value={query.timeout}
                    onChange={timeout =>
                      setQuery(prev => (prev ? { ...prev, timeout } : null))
                    }
                    label="Timeout"
                    placeholder="Default: 5m"
                    tooltip="How long the query can execute for before it is stopped"
                  />
                  <QueryDurationField
                    mode={mode}
                    value={query.ttl}
                    onChange={ttl =>
                      setQuery(prev => (prev ? { ...prev, ttl } : null))
                    }
                    label="TTL"
                    placeholder="Default: 720h"
                    tooltip="How long the query will remain in the system before it is deleted"
                  />
                  <QueryMemoryField
                    mode={mode}
                    value={query.memory}
                    onChange={memory =>
                      setQuery(prev => (prev ? { ...prev, memory } : null))
                    }
                    label="Memory"
                    availableMemories={availableMemories}
                    loading={memoriesLoading}
                  />
                  <QueryStreamingField
                    mode={mode}
                    value={streaming}
                    onChange={setStreaming}
                    label="Streaming"
                    metadata={query.metadata}
                  />
                  <tr>
                    <td className={FIELD_HEADING_STYLES}>Parameters</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {query.parameters?.length
                        ? `${query.parameters.length} param(s)`
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Advanced Settings Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Advanced Settings
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className={FIELD_HEADING_STYLES}>Selector</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {query.selector ? 'Configured' : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Status & Results Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Status & Results
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className={FIELD_HEADING_STYLES}>Phase</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {isNew ? '—' : query.status?.phase}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className={FIELD_HEADING_STYLES}>Cancel</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {query.cancel ? 'Requested' : 'No'}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className={FIELD_HEADING_STYLES}>Response</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {query.status?.response ? 'Available' : 'None'}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className={FIELD_HEADING_STYLES}>Token Usage</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {query.status?.tokenUsage
                        ? `${query.status.tokenUsage.promptTokens || 0} / ${query.status.tokenUsage.completionTokens || 0}`
                        : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className={FIELD_HEADING_STYLES}>Evaluations</td>
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {evaluationCount}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Input and Responses Section */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {/* Input Table */}
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                {/* Header */}
                {mode === 'new' &&
                toolSchema &&
                query.target?.type === 'tool' ? (
                  <div className="grid grid-cols-2 gap-0 border-b bg-gray-100 dark:bg-gray-800">
                    <div className="border-r border-gray-200 px-3 py-2 dark:border-gray-700">
                      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Input
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Input Schema
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={copySchemaToClipboard}
                        className="h-auto p-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                        <Copy className="h-2 w-2" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Input
                    </h3>
                  </div>
                )}

                {/* Content */}
                {mode === 'new' ? (
                  <div
                    className={
                      toolSchema && query.target?.type === 'tool'
                        ? 'grid grid-cols-2 gap-0'
                        : 'p-3'
                    }>
                    {/* Input Section */}
                    <div
                      className={
                        toolSchema && query.target?.type === 'tool'
                          ? 'border-r border-gray-200 p-3 dark:border-gray-700'
                          : ''
                      }>
                      <Textarea
                        value={
                          typeof query.input === 'string'
                            ? query.input || ''
                            : ''
                        }
                        onChange={e =>
                          setQuery(prev =>
                            prev ? { ...prev, input: e.target.value } : null,
                          )
                        }
                        placeholder="Enter your query input..."
                        className="min-h-[200px] resize-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>

                    {/* Tool Schema Example - only show for tool target */}
                    {toolSchema && query.target?.type === 'tool' && (
                      <div className="p-3">
                        <Textarea
                          value={
                            toolSchema.spec?.inputSchema
                              ? getSchemaExample(toolSchema.spec.inputSchema) ||
                                '{}'
                              : '{}'
                          }
                          readOnly
                          className="min-h-[200px] resize-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="bg-gray-50 p-3 font-mono text-sm whitespace-pre-wrap text-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
                    {typeof query.input === 'string'
                      ? query.input
                      : Array.isArray(query.input)
                        ? JSON.stringify(query.input, null, 2)
                        : ''}
                  </pre>
                )}
              </div>

              {/* Conditional Response or Error Section */}
              {query.status?.response ? (
                /* Response Section - show when there is a response */
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Response
                    </h3>
                    <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
                      <button
                        className={`rounded px-2 py-1 ${
                          responseViewMode === 'content'
                            ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                        onClick={() => setResponseViewMode('content')}>
                        Content
                      </button>
                      <button
                        className={`rounded px-2 py-1 ${
                          responseViewMode === 'raw'
                            ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                        onClick={() => setResponseViewMode('raw')}>
                        Raw
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <ResponseContent
                      content={query.status.response.content || 'No content'}
                      viewMode={responseViewMode}
                      rawJson={query.status.response}
                    />
                  </div>
                </div>
              ) : !isNew &&
                (query.status?.phase === 'failed' ||
                  query.status?.phase === 'error') ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Error
                    </h3>
                    <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
                      <button
                        className={`rounded px-2 py-1 ${
                          errorViewMode === 'events'
                            ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                        onClick={() => setErrorViewMode('events')}>
                        Events
                      </button>
                      <button
                        className={`rounded px-2 py-1 ${
                          errorViewMode === 'details'
                            ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                        onClick={() => setErrorViewMode('details')}>
                        Details
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <ErrorResponseContent
                      query={query}
                      viewMode={errorViewMode}
                    />
                  </div>
                </div>
              ) : null}

              {!isNew && (
                <div className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                  Note: Events expire after a certain amount of time and may no
                  longer be available for viewing.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}

export default function QueryDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          Loading...
        </div>
      }>
      <QueryDetailContent />
    </Suspense>
  );
}
