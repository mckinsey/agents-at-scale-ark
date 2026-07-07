'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/sonner';

import { Handyman } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import {
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import {
  getToolTypeKey,
  type ToolTypeKey,
  ToolsTable,
} from '@/components/sections/tools-table';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDelayedLoading } from '@/lib/hooks';
import {
  type Agent,
  type AgentTool,
  type Tool,
  agentsService,
  toolsService,
} from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';

const LEARN_MORE_URL =
  'https://mckinsey.github.io/agents-at-scale-ark/user-guide/tools/';

type TypeFilter = 'All' | ToolTypeKey;

const TYPE_ITEMS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'built-in', label: 'Built-in' },
  { value: 'mcp', label: 'MCP' },
  { value: 'agent', label: 'Agent' },
  { value: 'team', label: 'Team' },
];

export function ToolsSection() {
  const { readOnlyMode, namespace } = useNamespace();
  const [tools, setTools] = useState<Tool[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [toolsData, agentsData] = await Promise.all([
          toolsService.getAll(),
          agentsService.getAll(),
        ]);
        setTools(toolsData);
        setAgents(agentsData);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('Failed to Load Data', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [namespace]);

  const usage = useMemo(() => {
    const map: Record<string, { inUse: boolean; reason?: string }> = {};
    const agentsByTool: Record<string, string[]> = {};
    agents.forEach(agent => {
      agent.tools?.forEach((tool: AgentTool) => {
        if (tool.name) {
          agentsByTool[tool.name] ??= [];
          agentsByTool[tool.name].push(agent.name);
        }
      });
    });
    tools.forEach(tool => {
      const usingAgents = agentsByTool[tool.name] ?? [];
      map[tool.name] = {
        inUse: usingAgents.length > 0,
        reason:
          usingAgents.length > 0
            ? `Used by: ${usingAgents.join(', ')}`
            : undefined,
      };
    });
    return map;
  }, [tools, agents]);

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tools.filter(tool => {
      const matchesSearch =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        (tool.description?.toLowerCase().includes(q) ?? false);
      const matchesType =
        typeFilter === 'All' || getToolTypeKey(tool) === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [tools, searchQuery, typeFilter]);

  const handleDelete = async (id: string) => {
    const tool = tools.find(t => t.id === id);
    if (!tool || usage[tool.name]?.inUse) {
      return;
    }
    try {
      await toolsService.delete(tool.name);
      setTools(prev => prev.filter(t => t.id !== id));
      toast.success('Tool deleted successfully');
    } catch (error) {
      toast.error('Failed to Delete Tool', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const isEmpty = !loading && tools.length === 0;

  const addToolButton = readOnlyMode ? (
    <Button disabled>Add tool</Button>
  ) : (
    <NamespacedLink href="/tools/new">
      <Button>Add tool</Button>
    </NamespacedLink>
  );

  let body: ReactNode;
  if (showLoading) {
    body = (
      <div className="mt-5 flex flex-1 items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  } else if (isEmpty) {
    body = (
      <ResourceEmptyState
        icon={<Handyman className="size-full" />}
        title="No tools yet"
        description={
          <>
            <p className="mb-2">You haven&apos;t added any tools yet.</p>
            <p>Get started by adding your first tool.</p>
          </>
        }
        actions={
          <>
            {addToolButton}
            <a href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">Learn more</Button>
            </a>
          </>
        }
      />
    );
  } else {
    body = (
      <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
        <div className="flex flex-none items-end gap-3">
          <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
          <div className="flex w-48 flex-col gap-2">
            <span className="text-fg-secondary text-sm leading-5 tracking-[-0.112px]">
              Type
            </span>
            <Select
              items={TYPE_ITEMS}
              value={typeFilter}
              onValueChange={v => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_ITEMS.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredTools.length === 0 ? (
          <ResourceNoResults
            icon={<Handyman className="size-full" />}
            message="No tools match your search."
          />
        ) : (
          <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            <ToolsTable
              tools={filteredTools}
              usage={usage}
              onDelete={handleDelete}
            />
          </ScrollArea>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full mx-auto max-w-[1600px] flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              <Handyman className="size-full" />
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              Tools
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Create and manage tools
          </p>
        </div>
        {!isEmpty && addToolButton}
      </div>

      {body}
    </div>
  );
}
