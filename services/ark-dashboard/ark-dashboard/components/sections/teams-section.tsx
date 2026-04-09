'use client';

import { ArrowUpRightIcon, Plus } from 'lucide-react';
import type React from 'react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { TeamCard } from '@/components/cards';
import { TeamRow } from '@/components/rows/team-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { type ToggleOption, ToggleSwitch } from '@/components/ui/toggle-switch';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  type Agent,
  type Team,
  type TeamCreateRequest,
  type TeamUpdateRequest,
  agentsService,
  teamsService,
} from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';

export const TeamsSection = forwardRef<{ openAddEditor: () => void }>(
  function TeamsSection(_, ref) {
    const { push } = useNamespacedNavigation();
    const [teams, setTeams] = useState<Team[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const showLoading = useDelayedLoading(loading);
    const [showCompactView, setShowCompactView] = useState(false);

    const viewOptions: ToggleOption[] = [
      { id: 'compact', label: 'compact view', active: !showCompactView },
      { id: 'card', label: 'card view', active: showCompactView },
    ];
    const { readOnlyMode, namespace } = useNamespace();

    useImperativeHandle(ref, () => ({
      openAddEditor: () => push('/teams/new'),
    }));

    useEffect(() => {
      const loadData = async () => {
        setLoading(true);
        try {
          const [teamsData, agentsData] = await Promise.all([
            teamsService.getAll(),
            agentsService.getAll(),
          ]);
          setTeams(teamsData);
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

    const handleSaveTeam = async (
      team: (TeamCreateRequest | TeamUpdateRequest) & { id?: string },
    ) => {
      try {
        if (team.id) {
          // This is an update
          const updateRequest = team as TeamUpdateRequest & { id: string };
          await teamsService.updateById(updateRequest.id, updateRequest);
          toast.success('Team Updated', {
            description: 'Successfully updated the team',
          });
        } else {
          const createRequest = team as TeamCreateRequest;
          await teamsService.create(createRequest);
          toast.success('Team Created', {
            description: `Successfully created ${createRequest.name}`,
          });
        }
        // Reload data
        const updatedTeams = await teamsService.getAll();
        setTeams(updatedTeams);
      } catch (error) {
        toast.error(
          team.id ? 'Failed to Update Team' : 'Failed to Create Team',
          {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          },
        );
      }
    };

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
        // Reload data
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

    if (showLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      );
    }

    if (teams.length === 0 && !loading) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.teams.icon />
            </EmptyMedia>
            <EmptyTitle>No Teams Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t created any teams yet. Get started by creating
              your first team.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => push('/teams/new')}
              disabled={readOnlyMode}>
              <Plus className="h-4 w-4" />
              Create Team
            </Button>
            <Button
              variant="link"
              asChild
              className="text-muted-foreground"
              size="sm">
              <a
                href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/teams/"
                target="_blank">
                Learn More <ArrowUpRightIcon />
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-end px-6 py-3">
          <ToggleSwitch
            options={viewOptions}
            onChange={id => setShowCompactView(id === 'card')}
          />
        </div>

        <main className="flex-1 overflow-auto px-6 py-0">
          {showCompactView && (
            <div className="grid gap-6 pb-6 md:grid-cols-2 lg:grid-cols-3">
              {teams.map(team => (
                <TeamCard
                  key={team.id}
                  team={team}
                  agents={agents}
                  onUpdate={handleSaveTeam}
                  onDelete={handleDeleteTeam}
                />
              ))}
            </div>
          )}

          {!showCompactView && (
            <div className="flex flex-col gap-3">
              {teams.map(team => (
                <TeamRow
                  key={team.id}
                  team={team}
                  agents={agents}
                  onUpdate={handleSaveTeam}
                  onDelete={handleDeleteTeam}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    );
  },
);
