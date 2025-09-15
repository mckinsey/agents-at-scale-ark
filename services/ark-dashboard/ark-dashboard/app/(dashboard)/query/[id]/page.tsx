"use client";

import { QueryEvaluationActions } from "@/components/query-actions";
import { QueryMemoryField } from "@/components/query-fields/query-memory-field";
import { QueryTargetsField } from "@/components/query-fields/query-targets-field";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import type { components } from "@/lib/api/generated/types";
import { useMarkdownProcessor } from "@/lib/hooks/use-markdown-processor";
import {
  agentsService,
  memoriesService,
  modelsService,
  teamsService,
  toolsService
} from "@/lib/services";
import { queriesService } from "@/lib/services/queries";
import type { ToolDetail } from "@/lib/services/tools";
import { simplifyDuration } from "@/lib/utils/time";
import JsonDisplay from "@/components/JsonDisplay"
import { ErrorResponseContent } from '@/components/ErrorResponseContent';
import { Copy } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";


// Component for rendering response content
function ResponseContent({ content, viewMode, rawJson }: { content: string, viewMode: 'content'| 'text' | 'markdown' | 'raw', rawJson?: unknown }) {
  
  const markdownContent = useMarkdownProcessor(content);
  
  if (viewMode === 'raw') {
    const getJsonDisplay = () => {
      if (rawJson && typeof rawJson === 'object' && (rawJson as { raw?: string }).raw) {
        try {
          const parsed = JSON.parse((rawJson as { raw?: string }).raw!);
          // Create a more readable structure
          const readableJson = {
            content: (rawJson as { content?: string }).content || "No content",
            target: (rawJson as { target?: { name?: string; type?: string } }).target || "No target", 
            raw: parsed
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
          className="bg-black text-white p-4 rounded text-sm font-mono whitespace-pre-wrap break-words"
        />
      </div>
    )
  }
  

  if (viewMode === "markdown") {
    return <div className="text-sm">{markdownContent}</div>;
  }

  if (viewMode === 'content') {
    return (
      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900/50 p-3">
        {content || "No content"}
      </pre>
    )
  }
  
  return (
    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900/50 p-3">
      {content || "No content"}
    </pre>
  );
}

type QueryDetailResponse = components["schemas"]["QueryDetailResponse"]

// Proper typing for query status based on CRD structure
interface QueryStatus {
  phase?: string
  responses?: Array<{
    target?: {
      type: string
      name: string
    }
    content?: string
  }>
  evaluations?: Array<{
    evaluatorName?: string
    score?: string
    passed?: boolean
    metadata?: Record<string, string>
  }>
  tokenUsage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

interface TypedQueryDetailResponse extends Omit<QueryDetailResponse, 'status'> {
  status?: QueryStatus | null
}

// Reusable styles for table field headings  
const FIELD_HEADING_STYLES = "px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left"

interface QueryFieldProps {
  mode: 'new' | 'view'
  value: string | null | undefined
  onChange?: (value: string) => void
  label: string
  placeholder?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  tooltip?: string
}

function QueryDurationField({ mode, value, onChange, label, placeholder, inputRef, tooltip }: QueryFieldProps) {
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
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            className="text-xs"
          />
        </td>
      </tr>
    )
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
  )
}

function QueryNameField({ mode, value, onChange, label, placeholder, inputRef, tooltip }: QueryFieldProps) {
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
                <p>{tooltip || "Identifier of the query, must be unique in the namespace"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-3 py-2">
          <Input 
            ref={inputRef}
            value={value || ''} 
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder || "Enter query name"}
            className="text-xs"
          />
        </td>
      </tr>
    )
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
              <p>{tooltip || "Identifier of the query, must be unique in the namespace"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
        {value || "—"}
      </td>
    </tr>
  )
}

function QueryDetailContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryId = params.id as string
  const namespace = searchParams.get("namespace") || "default"
  const targetTool = searchParams.get("target_tool")
  const isNew = queryId === 'new'
  const mode = isNew ? 'new' : 'view'

  const [query, setQuery] = useState<TypedQueryDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [availableTargets, setAvailableTargets] = useState<Array<{name: string, type: 'agent' | 'model' | 'team' | 'tool'}>>([])
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [availableMemories, setAvailableMemories] = useState<Array<{name: string}>>([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [responseViewMode, setResponseViewMode] = useState<'content' | 'raw'>('content')
  const [errorViewMode, setErrorViewMode] = useState<'events' | 'details'>('events')
  const nameFieldRef = useRef<HTMLInputElement>(null)
  const [toolSchema, setToolSchema] = useState<ToolDetail | null>(null)

  // Copy schema to clipboard
  const copySchemaToClipboard = async () => {
    if (!toolSchema?.spec?.inputSchema) return
    
    const schemaText = getSchemaExample(toolSchema.spec.inputSchema) || '{}'
    try {
      await navigator.clipboard.writeText(schemaText)
      toast({
        title: "Copied to clipboard",
        description: "Input schema template has been copied"
      })
    } catch {
      toast({
        variant: "destructive", 
        title: "Copy failed",
        description: "Could not copy to clipboard"
      })
    }
  }

  // Extract example from JSON schema
  const getSchemaExample = (schema: Record<string, unknown>): string | null => {
    // Look for explicit examples
    if (schema.example) {
      return typeof schema.example === 'string' 
        ? schema.example 
        : JSON.stringify(schema.example, null, 2)
    }

    // Look for examples in properties or generate empty structure
    if (schema.type === 'object' && schema.properties) {
      const properties = schema.properties as Record<string, Record<string, unknown>>
      const example: Record<string, unknown> = {}

      for (const [key, prop] of Object.entries(properties)) {
        if (prop.example !== undefined) {
          example[key] = prop.example
        } else if (prop.default !== undefined) {
          example[key] = prop.default
        } else {
          // Generate empty placeholder based on type
          if (prop.type === 'string') {
            example[key] = ""
          } else if (prop.type === 'number' || prop.type === 'integer') {
            example[key] = 0
          } else if (prop.type === 'boolean') {
            example[key] = false
          } else if (prop.type === 'array') {
            example[key] = []
          } else if (prop.type === 'object') {
            example[key] = {}
          } else {
            example[key] = null
          }
        }
      }

      // Only return structure if there are properties to show
      if (Object.keys(example).length > 0) {
        return JSON.stringify(example, null, 2)
      }
    }

    return null
  }

  const handleSaveQuery = async () => {
    if (!query) return
    
    // Validate required fields
    if (!query.targets || query.targets.length === 0) {
      toast({
        variant: "destructive",
        title: "Missing Targets",
        description: "Please select at least one target (agent, model, team, or tool) to execute the query."
      })
      // TODO: Focus targets field
      return
    }
    
    setSaving(true)
    try {
      // Auto-generate name if empty
      let queryName = query.name?.trim()
      if (!queryName) {
        const now = new Date()
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
        const randomValue = window.crypto.getRandomValues(new Uint32Array(1))[0]
        const randomSuffix = (randomValue % 900000) + 100000;
        queryName = `ark-${dateStr}-${randomSuffix}`
      }
      
      // Prepare the query data for the API
      const queryData = {
        name: queryName,
        input: query.input || '',
        targets: query.targets || [],
        timeout: query.timeout,
        ttl: query.ttl,
        sessionId: query.sessionId,
        memory: query.memory
      }

      const savedQuery = await queriesService.create(namespace, queryData)
      
      toast({
        title: "Query Executed",
        description: `Query "${savedQuery.name}" has been created and is now executing.`
      })
      
      // Navigate to the created query
      router.push(`/query/${savedQuery.name}?namespace=${namespace}`)
    } catch (error) {
      console.error('Failed to save query:', error)
      toast({
        variant: "destructive",
        title: "Failed to Execute Query",
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      })
    } finally {
      setSaving(false)
    }
  }

  // Focus name field when in new mode
  useEffect(() => {
    if (isNew && nameFieldRef.current && !loading) {
      nameFieldRef.current.focus()
    }
  }, [isNew, loading])

  useEffect(() => {
    if (isNew) {
      // For new queries, initialize with empty object
      setQuery({
        name: '',
        namespace: namespace,
        input: '',
        targets: [],
        status: null
      } as TypedQueryDetailResponse)
      setLoading(false)

      // Load available targets and memories for new queries
      const loadResources = async () => {
        setTargetsLoading(true)
        setMemoriesLoading(true)
        try {
          const [agents, models, teams, tools, memories] = await Promise.all([
            agentsService.getAll(namespace),
            modelsService.getAll(namespace),
            teamsService.getAll(namespace),
            toolsService.getAll(namespace),
            memoriesService.getAll(namespace)
          ])

          const targets = [
            ...agents.map(a => ({ name: a.name, type: 'agent' as const })),
            ...models.map(m => ({ name: m.name, type: 'model' as const })),
            ...teams.map(t => ({ name: t.name, type: 'team' as const })),
            ...tools.map(t => ({ name: t.name, type: 'tool' as const }))
          ]

          setAvailableTargets(targets)
          setAvailableMemories(memories.map(m => ({ name: m.name })))

          // If target_tool param is present, auto-select that tool as target
          if (targetTool) {
            const foundTool = targets.find(t => t.type === 'tool' && t.name === targetTool)
            if (foundTool) {
              setQuery(prev => prev ? { ...prev, targets: [foundTool] } : null)
            }
          }
        } catch (error) {
          console.error('Failed to load resources:', error)
          toast({
            variant: "destructive",
            title: "Failed to Load Resources",
            description: "Could not load available agents, models, teams, tools, and memories"
          })
        } finally {
          setTargetsLoading(false)
          setMemoriesLoading(false)
        }
      }

      loadResources()
      return
    }

    const loadQuery = async () => {
      try {
        const queryData = await queriesService.get(namespace, queryId)
        setQuery(queryData as TypedQueryDetailResponse)
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to Load Query",
          description: error instanceof Error ? error.message : "An unexpected error occurred"
        })
      } finally {
        setLoading(false)
      }
    }

    loadQuery()
  }, [namespace, queryId, isNew, targetTool])

  // Fetch tool schema when exactly one tool is selected
  useEffect(() => {
    const selectedTools = query?.targets?.filter(t => t.type === 'tool') || []
    
    if (selectedTools.length === 1) {
      const toolName = selectedTools[0].name
      toolsService.getDetail(namespace, toolName)
        .then(setToolSchema)
        .catch(() => setToolSchema(null)) // Silent failure
    } else {
      setToolSchema(null)
    }
  }, [query?.targets, namespace])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading query...</div>
      </div>
    )
  }

  if (!query) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Query Not Found</h1>
          <Button variant="outline" onClick={() => router.back()}>
            ← Back to Queries
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/queries?namespace=${namespace}`}>
                Queries
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{isNew ? 'New Query' : query.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex gap-2">
          {!isNew && (
            <QueryEvaluationActions 
              queryName={queryId} 
              namespace={namespace} 
            />
          )}
          {isNew && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push(`/query/new?namespace=${namespace}`)}
              >
                New Query
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={handleSaveQuery}
                disabled={saving}
              >
                {saving ? 'Executing...' : 'Execute Query'}
              </Button>
            </>
          )}
          {!isNew && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push(`/query/new?namespace=${namespace}`)}
            >
              New Query
            </Button>
          )}
        </div>
      </header>
      <div className="flex h-full flex-col">

      {/* Query Details - Three Column Layout */}
      <div className="px-4 py-3 border-b bg-gray-50/30 dark:bg-gray-900/10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Query Column */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Query</h3>
                <a href={`/events?namespace=${namespace}&kind=Query&name=${query.name}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                  View Events
                </a>
              </div>
            </div>
            <table className="w-full table-fixed">
              <tbody>
                <QueryNameField 
                  mode={mode}
                  value={query.name}
                  onChange={(name) => setQuery(prev => prev ? { ...prev, name } : null)}
                  label="Name"
                  placeholder="Default: Auto-generated"
                  inputRef={nameFieldRef}
                />
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 text-xs font-medium text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
                          Svc. Account
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Kubernetes ServiceAccount used for RBAC permissions during query execution</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">
                    {query.serviceAccount || "—"}
                  </td>
                </tr>
                <QueryTargetsField 
                  mode={mode}
                  value={query.targets || []}
                  onChange={(targets) => setQuery(prev => prev ? { ...prev, targets } : null)}
                  label="Targets"
                  availableTargets={availableTargets}
                  loading={targetsLoading}
                />
                <QueryNameField 
                  mode={mode}
                  value={query.sessionId}
                  onChange={(sessionId) => setQuery(prev => prev ? { ...prev, sessionId } : null)}
                  label="Session ID"
                  placeholder="Default: Auto-generated"
                  tooltip="Identifier for grouping related queries, used for conversation memory"
                />
              </tbody>
            </table>
          </div>

          {/* Configuration Column */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Configuration</h3>
            </div>
            <table className="w-full">
              <tbody>
                <QueryDurationField 
                  mode={mode}
                  value={query.timeout}
                  onChange={(timeout) => setQuery(prev => prev ? { ...prev, timeout } : null)}
                  label="Timeout"
                  placeholder="Default: 5m"
                  tooltip="How long the query can execute for before it is stopped"
                />
                <QueryDurationField 
                  mode={mode}
                  value={query.ttl}
                  onChange={(ttl) => setQuery(prev => prev ? { ...prev, ttl } : null)}
                  label="TTL"
                  placeholder="Default: 720h"
                  tooltip="How long the query will remain in the system before it is deleted"
                />
                <QueryMemoryField 
                  mode={mode}
                  value={query.memory}
                  onChange={(memory) => setQuery(prev => prev ? { ...prev, memory } : null)}
                  label="Memory"
                  availableMemories={availableMemories}
                  loading={memoriesLoading}
                />
                <tr>
                  <td className={FIELD_HEADING_STYLES}>
                    Parameters
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.parameters?.length ? `${query.parameters.length} param(s)` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Advanced Settings Column */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Advanced Settings</h3>
            </div>
            <table className="w-full">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Selector
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.selector ? "Configured" : "—"}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Evaluators
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.evaluators?.length ? `${query.evaluators.length} evaluator(s)` : "—"}
                  </td>
                </tr>
                <tr>
                  <td className={FIELD_HEADING_STYLES}>
                    Eval. Selector
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.evaluatorSelector ? "Configured" : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Status & Results Column */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Status & Results</h3>
            </div>
            <table className="w-full">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Phase
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.status?.phase || "pending"}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Cancel
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.cancel ? "Requested" : "No"}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Responses
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.status?.responses?.length || 0}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Token Usage
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.status?.tokenUsage ? `${query.status.tokenUsage.promptTokens || 0} / ${query.status.tokenUsage.completionTokens || 0}` : "—"}
                  </td>
                </tr>
                <tr>
                  <td className={FIELD_HEADING_STYLES}>
                    Evaluations
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {query.status?.evaluations?.length || 0}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* Input and Responses Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-3">
            
            {/* Input Table */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* Header */}
              {mode === 'new' && toolSchema && query.targets?.filter(t => t.type === 'tool').length === 1 ? (
                <div className="grid grid-cols-2 gap-0 bg-gray-100 dark:bg-gray-800 border-b">
                  <div className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Input</h3>
                  </div>
                  <div className="px-3 py-2 flex items-center gap-2">
                    <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Input Schema</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copySchemaToClipboard}
                      className="h-auto p-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <Copy className="h-2 w-2" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b flex items-center justify-between">
                  <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Input</h3>
                </div>
              )}

              {/* Content */}
              {mode === 'new' ? (
                <div className={toolSchema && query.targets?.filter(t => t.type === 'tool').length === 1 ? 'grid grid-cols-2 gap-0' : 'p-3'}>
                  {/* Input Section */}
                  <div className={toolSchema && query.targets?.filter(t => t.type === 'tool').length === 1 ? 'p-3 border-r border-gray-200 dark:border-gray-700' : ''}>
                    <Textarea
                      value={query.input || ''}
                      onChange={(e) => setQuery(prev => prev ? { ...prev, input: e.target.value } : null)}
                      placeholder="Enter your query input..."
                      className="min-h-[200px] text-sm font-mono resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                  
                  {/* Tool Schema Example - only show for single tool selection */}
                  {toolSchema && query.targets?.filter(t => t.type === 'tool').length === 1 && (
                    <div className="p-3">
                      <Textarea
                        value={toolSchema.spec?.inputSchema ? getSchemaExample(toolSchema.spec.inputSchema) || '{}' : '{}'}
                        readOnly
                        className="min-h-[200px] text-sm font-mono resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900/50 p-3">
                  {query.input}
                </pre>
              )}
            </div>

                        {/* Conditional Response or Error Section */}
            {query.status?.responses && query.status.responses.length > 0 ? (
              /* Response Section - show when there are responses */
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b flex items-center justify-between">
                  <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Response</h3>
                  <div className="flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap flex-shrink-0">
                    <button 
                      className={`px-2 py-1 rounded ${
                        responseViewMode === 'content' 
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                      onClick={() => setResponseViewMode('content')}
                    >
                      Content
                    </button>
                    <button 
                      className={`px-2 py-1 rounded ${
                        responseViewMode === 'raw' 
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                      onClick={() => setResponseViewMode('raw')}
                    >
                      Raw
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  {query.status?.responses?.map((response, index) => (
                    <div key={index} className="mb-4 last:mb-0">
                      <ResponseContent 
                        content={response.content || "No content"} 
                        viewMode={responseViewMode} 
                        rawJson={response} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Error Section - show when there's an error or no responses */
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b flex items-center justify-between">
                  <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Error</h3>
                  <div className="flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap flex-shrink-0">
                    <button 
                      className={`px-2 py-1 rounded ${
                        errorViewMode === 'events' 
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                      onClick={() => setErrorViewMode('events')}
                    >
                      Events
                    </button>
                    <button 
                      className={`px-2 py-1 rounded ${
                        errorViewMode === 'details' 
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                      onClick={() => setErrorViewMode('details')}
                    >
                      Details
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <ErrorResponseContent 
                    query={query}
                    viewMode={errorViewMode}
                    namespace={namespace}
                  />
                </div>
              </div>
            )}
            
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
              Note: Events expire after a certain amount of time and may no longer be available for viewing.
            </div>
          </div>
        </ScrollArea>
      </div>
      </div>
    </>
  )
}

export default function QueryDetailPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <QueryDetailContent />
    </Suspense>
  )
}