'use client';

import { useAtomValue } from 'jotai';
import { useParams, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { queryTimeoutSettingAtom } from '@/atoms/experimental-features';
import { ErrorResponseContent } from '@/components/ErrorResponseContent';
import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import {
  DetailCard as QueryDetailCard,
  DetailRow as QueryDetailRow,
  DetailSectionCard as QuerySectionCard,
} from '@/components/common/detail-card';
import { JsonViewer } from '@/components/common/json-viewer';
import { ContentCopy } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { QueryMemoryField } from '@/components/query-fields/query-memory-field';
import { QueryTargetsField } from '@/components/query-fields/query-targets-field';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { PromptEditor } from '@/components/ui/prompt-editor';
import { QueryParameterEditor } from '@/components/ui/query-parameter-editor';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { components } from '@/lib/api/generated/types';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { renderMarkdown } from '@/lib/hooks/render-markdown';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  agentsService,
  memoriesService,
  modelsService,
  teamsService,
  toolsService,
} from '@/lib/services';
import type { Agent } from '@/lib/services/agents';
import { useArkConfig } from '@/lib/services/arkconfig-hooks';
import { queriesService } from '@/lib/services/queries';
import type { ToolDetail } from '@/lib/services/tools';
import { cn } from '@/lib/utils';
import {
  type QueryParameter,
  extractAgentRequiredParams,
  transformApiToQueryParameters,
  transformQueryParametersToApi,
} from '@/lib/utils/query-parameters';
import { simplifyDuration } from '@/lib/utils/time';
import { useNamespace } from '@/providers/NamespaceProvider';

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
  const markdownContent = renderMarkdown(content);

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
      <div className="overflow-hidden rounded-lg">
        <JsonViewer value={getJsonDisplay()} />
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
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

interface TypedQueryDetailResponse extends Omit<
  QueryDetailResponse,
  'status' | 'targets'
> {
  status?: QueryStatus | null;
  metadata?: Record<string, string>;
  target?: { name: string; type: string };
  timeout?: string | null;
}

function QueryViewSegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: Readonly<{
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-5 items-center px-2 text-sm tracking-[-0.028px] transition-colors',
            value === option.value
              ? 'bg-fill-muted text-fg-primary'
              : 'text-fg-tertiary hover:bg-fill-muted hover:text-fg-primary',
          )}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function getStringInput(input: unknown): string {
  return typeof input === 'string' ? input : '';
}

function formatQueryInput(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) return JSON.stringify(input, null, 2);
  return '';
}

interface QueryViewModeProps {
  query: TypedQueryDetailResponse;
  responseViewMode: 'content' | 'raw';
  setResponseViewMode: (mode: 'content' | 'raw') => void;
  errorViewMode: 'events' | 'details';
  setErrorViewMode: (mode: 'events' | 'details') => void;
  queryParameters: QueryParameter[];
  streaming: boolean;
}

function QueryViewMode({
  query,
  responseViewMode,
  setResponseViewMode,
  errorViewMode,
  setErrorViewMode,
  queryParameters,
  streaming,
}: Readonly<QueryViewModeProps>) {
  const phase = query.status?.phase;
  const hasResponse = !!query.status?.response;
  const isFailed = phase === 'failed' || phase === 'error';
  const targetDisplay = query.target
    ? `${query.target.type}:${query.target.name}`
    : '—';
  const tokenUsage = query.status?.tokenUsage
    ? `${query.status.tokenUsage.promptTokens || 0} / ${query.status.tokenUsage.completionTokens || 0}`
    : '—';
  const inputText = formatQueryInput(query.input);
  const eventsHref = `/events?kind=Query&name=${query.name}`;

  return (
    <div className="content-shell flex w-full flex-col gap-5">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <DetailBreadcrumb
            backHref="/queries"
            backLabel="Queries"
            current={query.name}
          />
          <div className="flex items-center gap-3">
            <a href={eventsHref} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">View events</Button>
            </a>
            <NamespacedLink href="/query/new">
              <Button>New Query</Button>
            </NamespacedLink>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">{query.name}</h1>
      </header>

      <div className="flex items-stretch gap-3">
        <QueryDetailCard title="Query details">
          <QueryDetailRow
            label="Svc account"
            value={query.serviceAccount || '—'}
          />
          <QueryDetailRow label="Target" value={targetDisplay} />
          <QueryDetailRow label="Session ID" value={query.sessionId || '—'} />
          <QueryDetailRow
            label="Conversation ID"
            value={query.conversationId || '—'}
            last
          />
        </QueryDetailCard>

        <QueryDetailCard title="Configuration">
          <QueryDetailRow
            label="Timeout"
            value={simplifyDuration(query.timeout) || '—'}
          />
          <QueryDetailRow
            label="TTL"
            value={simplifyDuration(query.ttl) || '—'}
          />
          <QueryDetailRow label="Memory" value={query.memory?.name || '—'} />
          <QueryDetailRow label="Streaming" value={streaming ? 'Yes' : 'No'} />
          <QueryDetailRow
            label="Parameters"
            value={
              query.parameters?.length
                ? `${query.parameters.length} param(s)`
                : '—'
            }
            last
          />
        </QueryDetailCard>

        <QueryDetailCard title="Advanced Settings">
          <QueryDetailRow
            label="Selector"
            value={query.selector ? 'Configured' : '—'}
            last
          />
        </QueryDetailCard>

        <QueryDetailCard title="Status & Results">
          <QueryDetailRow label="Phase" value={phase || '—'} />
          <QueryDetailRow
            label="Cancel"
            value={query.cancel ? 'Requested' : 'No'}
          />
          <QueryDetailRow
            label="Output"
            value={hasResponse ? 'Available' : 'None'}
          />
          <QueryDetailRow label="Token usage" value={tokenUsage} last />
        </QueryDetailCard>
      </div>

      <QuerySectionCard title="Input">
        <div className="text-fg-primary py-2 text-base leading-6 tracking-[-0.032px] whitespace-pre-wrap">
          {inputText || '—'}
        </div>
      </QuerySectionCard>

      {hasResponse && (
        <QuerySectionCard
          title="Output"
          headerRight={
            <QueryViewSegmentedToggle
              options={[
                { value: 'content', label: 'Content' },
                { value: 'raw', label: 'Raw' },
              ]}
              value={responseViewMode}
              onChange={setResponseViewMode}
            />
          }>
          <div className="py-2">
            <ResponseContent
              content={query.status?.response?.content || 'No content'}
              viewMode={responseViewMode}
              rawJson={query.status?.response}
            />
          </div>
        </QuerySectionCard>
      )}

      {!hasResponse && isFailed && (
        <QuerySectionCard
          title="Error"
          headerRight={
            <QueryViewSegmentedToggle
              options={[
                { value: 'events', label: 'Events' },
                { value: 'details', label: 'Details' },
              ]}
              value={errorViewMode}
              onChange={setErrorViewMode}
            />
          }>
          <div className="py-2">
            <ErrorResponseContent query={query} viewMode={errorViewMode} />
          </div>
        </QuerySectionCard>
      )}

      {queryParameters.length > 0 && (
        <QuerySectionCard title="Parameters">
          <div className="flex flex-col gap-2 py-2">
            {queryParameters.map(param => (
              <div key={param.id} className="flex items-center gap-4">
                <span className="text-fg-secondary w-[140px] shrink-0 font-mono text-xs">
                  {param.name}
                </span>
                <span className="text-fg-primary text-sm">
                  {param.value || (
                    <span className="text-fg-tertiary italic">empty</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </QuerySectionCard>
      )}

      <p className="text-fg-tertiary text-center text-xs">
        Note: Events expire after a certain amount of time and may no longer be
        available for viewing.
      </p>
    </div>
  );
}

function QueryDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { push } = useNamespacedNavigation();
  const { namespace } = useNamespace();
  const queryId = params.id as string;
  const targetTool = searchParams.get('target_tool');
  const isNew = queryId === 'new';
  const mode = isNew ? 'new' : 'view';

  const { data: arkConfig } = useArkConfig();
  const ttlPlaceholder = `Default: ${arkConfig?.queryTTL || '720h'}`;

  const [query, setQuery] = useState<TypedQueryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
  const defaultQueryTimeout = useAtomValue(queryTimeoutSettingAtom);
  const [queryParameters, setQueryParameters] = useState<QueryParameter[]>([]);
  const [selectedAgentDetails, setSelectedAgentDetails] =
    useState<Agent | null>(null);

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
      const apiParameters = transformQueryParametersToApi(queryParameters);
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
        ...(query.conversationId && { conversationId: query.conversationId }),
        memory: query.memory,
        ...(apiParameters.length > 0 && { parameters: apiParameters }),
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
      push(`/query/${savedQuery.name}`);
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
        timeout: defaultQueryTimeout,
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

        // Load existing parameters
        const typedQueryData = queryData as TypedQueryDetailResponse;
        if (typedQueryData.parameters) {
          setQueryParameters(
            transformApiToQueryParameters(typedQueryData.parameters),
          );
        }

        // Set streaming state based on annotation
        const isStreamingEnabled =
          (queryData as TypedQueryDetailResponse).metadata?.[
            ARK_ANNOTATIONS.STREAMING_ENABLED
          ] === 'true';
        setStreaming(isStreamingEnabled);
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
  }, [queryId, isNew, targetTool, defaultQueryTimeout, namespace]);

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

  // Fetch agent details when target is an agent (for AC2: agent-required params)
  useEffect(() => {
    if (query?.target?.type === 'agent') {
      const agentName = query.target.name;
      agentsService
        .getByName(agentName)
        .then(setSelectedAgentDetails)
        .catch(() => setSelectedAgentDetails(null));
    } else {
      setSelectedAgentDetails(null);
    }
  }, [query?.target]);

  // Extract agent-required query parameters
  const agentRequiredParams = useMemo(
    () => extractAgentRequiredParams(selectedAgentDetails?.parameters),
    [selectedAgentDetails],
  );

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
          <Button variant="outline" onClick={() => push('/queries')}>
            ← Back to Queries
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'view') {
    return (
      <QueryViewMode
        query={query}
        responseViewMode={responseViewMode}
        setResponseViewMode={setResponseViewMode}
        errorViewMode={errorViewMode}
        setErrorViewMode={setErrorViewMode}
        queryParameters={queryParameters}
        streaming={streaming}
      />
    );
  }

  const isToolTarget = toolSchema && query.target?.type === 'tool';

  return (
    <div className="content-shell flex w-full flex-col gap-5">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <DetailBreadcrumb
            backHref="/queries"
            backLabel="Queries"
            current="New Query"
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => push('/query/new')}>
              New Query
            </Button>
            <Button onClick={handleSaveQuery} disabled={saving}>
              {saving ? 'Executing...' : 'Execute Query'}
            </Button>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">New Query</h1>
      </header>

      <div className="flex items-stretch gap-3">
        <QueryDetailCard title="Query details">
          <QueryDetailRow
            label="Name"
            valueClassName=""
            value={
              <Input
                ref={nameFieldRef}
                variant="inline"
                size="sm"
                value={query.name || ''}
                onChange={e =>
                  setQuery(prev =>
                    prev ? { ...prev, name: e.target.value } : null,
                  )
                }
                placeholder="Default: Auto-generated"
              />
            }
          />
          <QueryDetailRow
            label="Svc account"
            value={query.serviceAccount || '—'}
          />
          <QueryDetailRow
            label="Target"
            valueClassName=""
            value={
              <QueryTargetsField
                value={query.target ? [query.target] : []}
                onChange={targets =>
                  setQuery(prev =>
                    prev ? { ...prev, target: targets[0] } : null,
                  )
                }
                availableTargets={availableTargets}
                loading={targetsLoading}
              />
            }
          />
          <QueryDetailRow
            label="Session ID"
            valueClassName=""
            value={
              <Input
                variant="inline"
                size="sm"
                value={query.sessionId || ''}
                onChange={e =>
                  setQuery(prev =>
                    prev ? { ...prev, sessionId: e.target.value } : null,
                  )
                }
                placeholder="Default: Auto-generated"
              />
            }
          />
          <QueryDetailRow
            label="Conversation ID"
            valueClassName=""
            last
            value={
              <Input
                variant="inline"
                size="sm"
                value={query.conversationId || ''}
                onChange={e =>
                  setQuery(prev =>
                    prev ? { ...prev, conversationId: e.target.value } : null,
                  )
                }
                placeholder="Default: Auto-generated"
              />
            }
          />
        </QueryDetailCard>

        <QueryDetailCard title="Configuration">
          <QueryDetailRow
            label="Timeout"
            valueClassName=""
            value={
              <Input
                variant="inline"
                size="sm"
                value={query.timeout || ''}
                onChange={e =>
                  setQuery(prev =>
                    prev ? { ...prev, timeout: e.target.value } : null,
                  )
                }
                placeholder="Default: 5m"
              />
            }
          />
          <QueryDetailRow
            label="TTL"
            valueClassName=""
            value={
              <Input
                variant="inline"
                size="sm"
                value={query.ttl || ''}
                onChange={e =>
                  setQuery(prev =>
                    prev ? { ...prev, ttl: e.target.value } : null,
                  )
                }
                placeholder={ttlPlaceholder}
              />
            }
          />
          <QueryDetailRow
            label="Memory"
            valueClassName=""
            value={
              <QueryMemoryField
                value={query.memory}
                onChange={memory =>
                  setQuery(prev => (prev ? { ...prev, memory } : null))
                }
                availableMemories={availableMemories}
                loading={memoriesLoading}
              />
            }
          />
          <QueryDetailRow
            label="Streaming"
            valueClassName=""
            value={
              <Switch checked={streaming} onCheckedChange={setStreaming} />
            }
          />
          <QueryDetailRow
            label="Parameters"
            last
            value={
              queryParameters.length
                ? `${queryParameters.length} param(s)`
                : '—'
            }
          />
        </QueryDetailCard>

        <QueryDetailCard title="Advanced Settings">
          <QueryDetailRow
            label="Selector"
            value={query.selector ? 'Configured' : '—'}
            last
          />
        </QueryDetailCard>

        <QueryDetailCard title="Status & Results">
          <QueryDetailRow label="Phase" value="—" />
          <QueryDetailRow label="Cancel" value="No" />
          <QueryDetailRow label="Output" value="None" />
          <QueryDetailRow label="Token usage" value="—" last />
        </QueryDetailCard>
      </div>

      <QuerySectionCard
        title="Input"
        headerRight={
          isToolTarget ? (
            <div className="flex items-center gap-2">
              <span className="label-regular-primary text-fg-secondary">
                Input Schema
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={copySchemaToClipboard}>
                <IconShell size="sm">
                  <ContentCopy />
                </IconShell>
              </Button>
            </div>
          ) : undefined
        }>
        {isToolTarget ? (
          <div className="grid grid-cols-2 gap-0 py-2">
            <div className="border-stroke-divider min-h-[260px] border-r pr-2">
              <PromptEditor
                value={getStringInput(query.input)}
                onChange={value =>
                  setQuery(prev => (prev ? { ...prev, input: value } : null))
                }
                placeholder="Enter your query input... Use {{.paramName}} for variables."
                parameters={queryParameters}
                className="h-full min-h-[260px]"
                textareaClassName="border-0 rounded-none focus:ring-0 focus:ring-offset-0"
                highlightClassName="rounded-none"
              />
            </div>
            <div className="flex min-h-[260px] flex-col pl-2">
              <Textarea
                value={
                  toolSchema?.spec?.inputSchema
                    ? getSchemaExample(toolSchema.spec.inputSchema) || '{}'
                    : '{}'
                }
                readOnly
                className="h-full min-h-[260px] w-full resize-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        ) : (
          <div className="min-h-[260px] py-2">
            <PromptEditor
              value={typeof query.input === 'string' ? query.input || '' : ''}
              onChange={value =>
                setQuery(prev => (prev ? { ...prev, input: value } : null))
              }
              placeholder="Enter your query input... Use {{.paramName}} for variables."
              parameters={queryParameters}
              className="h-full min-h-[260px]"
              textareaClassName="border-0 rounded-none focus:ring-0 focus:ring-offset-0"
              highlightClassName="rounded-none"
            />
          </div>
        )}
      </QuerySectionCard>

      <QueryParameterEditor
        parameters={queryParameters}
        onChange={setQueryParameters}
        inputText={getStringInput(query.input)}
        agentRequiredParams={agentRequiredParams}
      />
    </div>
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
