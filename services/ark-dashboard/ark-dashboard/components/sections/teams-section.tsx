'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Group, Search } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { TeamsTable } from '@/components/sections/teams-table';
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
import { type Team, teamsService } from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';

type StatusFilter = 'All' | 'True' | 'False';

const STATUS_ITEMS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'True', label: 'Active' },
  { value: 'False', label: 'Error' },
];

const LEARN_MORE_URL =
  'https://mckinsey.github.io/agents-at-scale-ark/user-guide/teams/';

function TeamsEmptyState({ readOnlyMode }: { readOnlyMode: boolean }) {
  return (
    <div className="bg-surface-primary flex flex-col items-center justify-center py-12">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-surface-secondary flex items-center p-3">
            <IconShell size="default" variant="secondary">
              <Group />
            </IconShell>
          </div>
          <p className="text-fg-primary text-xl leading-7">No teams yet</p>
          <div className="text-fg-secondary text-center text-base leading-6 tracking-[-0.128px]">
            <p className="mb-2">You haven&apos;t created any teams yet.</p>
            <p>Get started by creating your first team.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          {readOnlyMode ? (
            <Button disabled>Create Team</Button>
          ) : (
            <NamespacedLink href="/teams/new">
              <Button>Create Team</Button>
            </NamespacedLink>
          )}
          <a href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">Learn more</Button>
          </a>
        </div>
      </div>
    </div>
  );
}

export function TeamsSection() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const showLoading = useDelayedLoading(loading);
  const { readOnlyMode, namespace } = useNamespace();

  const filteredTeams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teams.filter(team => {
      const matchesSearch =
        !q ||
        team.name.toLowerCase().includes(q) ||
        (team.description?.toLowerCase().includes(q) ?? false);
      const matchesStatus =
        statusFilter === 'All' || (team.available ?? 'Unknown') === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [teams, searchQuery, statusFilter]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const teamsData = await teamsService.getAll();
        setTeams(teamsData);
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

  const handleDeleteTeam = async (id: string) => {
    try {
      const team = teams.find(t => t.id === id);
      if (!team) {
        throw new Error('Team not found');
      }
      await teamsService.deleteById(id);
      toast.success('Team Deleted', {
        description: `Successfully deleted ${team.name}`,
      });
      const updatedTeams = await teamsService.getAll();
      setTeams(updatedTeams);
    } catch (error) {
      toast.error('Failed to Delete Team', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const isEmpty = !loading && teams.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <IconShell size="default" variant="primary">
            <Group />
          </IconShell>
          <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
            Teams
          </h1>
        </div>
        <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
          Compose and manage teams of agents to coordinate tasks
        </p>
      </div>

      {showLoading ? (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      ) : isEmpty ? (
        <div className="mt-5 flex-1">
          <TeamsEmptyState readOnlyMode={readOnlyMode} />
        </div>
      ) : (
        <div className="mx-auto mt-5 flex min-h-0 w-full max-w-[1344px] flex-1 flex-col gap-3">
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
              <Button disabled>Create Team</Button>
            ) : (
              <NamespacedLink href="/teams/new">
                <Button>Create Team</Button>
              </NamespacedLink>
            )}
          </div>

          <ScrollArea className="h-0 min-h-0 flex-1">
            <TeamsTable teams={filteredTeams} onDelete={handleDeleteTeam} />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
