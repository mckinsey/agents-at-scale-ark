'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Search, SmartToy } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { AgentsTable } from '@/components/sections/agents-table';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
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
import { type Agent, agentsService } from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';

type StatusFilter = 'All' | 'True' | 'False';

const STATUS_ITEMS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'True', label: 'Active' },
  { value: 'False', label: 'Error' },
];

const LEARN_MORE_URL =
  'https://mckinsey.github.io/agents-at-scale-ark/user-guide/agents/';

function AgentsEmptyState({ readOnlyMode }: { readOnlyMode: boolean }) {
  return (
    <div className="bg-surface-primary flex flex-col items-center justify-center py-12">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-surface-secondary flex items-center p-3">
            <IconShell size="default" variant="secondary">
              <SmartToy />
            </IconShell>
          </div>
          <p className="text-fg-primary text-xl leading-7">No agents yet</p>
          <div className="text-fg-secondary text-center text-base leading-6 tracking-[-0.128px]">
            <p className="mb-2">You haven&apos;t created any agents yet.</p>
            <p>Get started by creating your first agent.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          {readOnlyMode ? (
            <Button disabled>Create Agent</Button>
          ) : (
            <NamespacedLink href="/agents/new">
              <Button>Create Agent</Button>
            </NamespacedLink>
          )}
          <a
            href={LEARN_MORE_URL}
            target="_blank"
            rel="noopener noreferrer">
            <Button variant="outline">Learn more</Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export function AgentsSection() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const showLoading = useDelayedLoading(loading);
  const { readOnlyMode, namespace } = useNamespace();

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return agents.filter(agent => {
      const matchesSearch =
        !q ||
        agent.name.toLowerCase().includes(q) ||
        (agent.description?.toLowerCase().includes(q) ?? false);
      const matchesStatus =
        statusFilter === 'All' || (agent.available ?? 'Unknown') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [agents, searchQuery, statusFilter]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const agentsData = await agentsService.getAll();
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

  const handleDeleteAgent = async (id: string) => {
    try {
      const agent = agents.find(a => a.id === id);
      if (!agent) {
        throw new Error('Agent not found');
      }
      await agentsService.deleteById(id);
      toast.success('Agent Deleted', {
        description: `Successfully deleted ${agent.name}`,
      });
      const updatedAgents = await agentsService.getAll();
      setAgents(updatedAgents);
    } catch (error) {
      toast.error('Failed to Delete Agent', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const isEmpty = !loading && agents.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <IconShell size="default" variant="primary">
            <SmartToy />
          </IconShell>
          <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
            Agents
          </h1>
        </div>
        <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
          Create and manage agents to automate tasks
        </p>
      </div>

      {showLoading ? (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      ) : isEmpty ? (
        <div className="mt-5 flex-1">
          <AgentsEmptyState readOnlyMode={readOnlyMode} />
        </div>
      ) : (
        <div className="mx-auto mt-5 flex min-h-0 w-full max-w-[1344px] flex-1 flex-col gap-2">
          <div className="flex flex-none items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <div className="relative w-[493px]">
                <span className="text-fg-tertiary pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
                  <IconShell size="sm" variant="secondary">
                    <Search />
                  </IconShell>
                </span>
                <Input
                  type="search"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex w-48 flex-col gap-2">
                <span className="text-fg-secondary text-sm leading-5 tracking-[-0.112px]">
                  Status
                </span>
                <Select
                  items={STATUS_ITEMS}
                  value={statusFilter}
                  onValueChange={v => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ITEMS.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        <SelectItemText>{item.label}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {readOnlyMode ? (
              <Button disabled>Create Agent</Button>
            ) : (
              <NamespacedLink href="/agents/new">
                <Button>Create Agent</Button>
              </NamespacedLink>
            )}
          </div>

          <ScrollArea className="h-0 min-h-0 flex-1">
            <AgentsTable
              agents={filteredAgents}
              onDelete={handleDeleteAgent}
            />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
