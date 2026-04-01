'use client';

import { ArrowLeft, Code, Save, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { PanelToggleButton } from '@/components/common/panel-toggle-button';
import { YamlViewer } from '@/components/common/yaml-viewer';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { Team } from '@/lib/services';
import { teamsService } from '@/lib/services';

import {
  BasicInfoSection,
  GraphSection,
  MembersSection,
  SelectorSection,
  StrategySection,
} from './sections';
import { TeamFormMode, type TeamFormProps } from './types';
import { useTeamForm } from './use-team-form';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/teams', label: 'Teams' },
];

export function TeamForm({ mode, teamName, onSuccess }: TeamFormProps) {
  const router = useRouter();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const isViewing = mode === TeamFormMode.VIEW;
  const isCreating = mode === TeamFormMode.CREATE;

  useEffect(() => {
    if (isViewing) {
      setTeamsLoading(true);
      teamsService
        .getAll()
        .then(teams => setAllTeams(teams))
        .catch(console.error)
        .finally(() => setTeamsLoading(false));
    }
  }, [isViewing]);

  const { form, state, actions } = useTeamForm({
    mode,
    teamName,
    onSuccess,
  });

  const {
    loading,
    saving,
    team,
    agents,
    selectedMembers,
    graphEdges,
    unavailableMembers,
    hasChanges,
  } = state;

  const { setSelectedMembers, setGraphEdges, setUnavailableMembers, onSubmit } =
    actions;

  const teamYaml = useMemo(() => {
    if (!team) return '';

    const lines: string[] = [
      'apiVersion: ark.mckinsey.com/v1alpha1',
      'kind: Team',
      'metadata:',
      `  name: ${team.name}`,
      `  namespace: ${team.namespace}`,
      'spec:',
    ];

    if (team.description) {
      lines.push(`  description: ${team.description}`);
    }

    if (team.strategy) {
      lines.push(`  strategy: ${team.strategy}`);
    }

    if (team.loops) {
      lines.push(`  loops: ${team.loops}`);
    }

    if (team.maxTurns) {
      lines.push(`  maxTurns: ${team.maxTurns}`);
    }

    if (team.members && team.members.length > 0) {
      lines.push('  members:');
      team.members.forEach(member => {
        lines.push(`    - name: ${member.name}`);
        lines.push(`      type: ${member.type}`);
      });
    }

    if (team.selector) {
      lines.push('  selector:');
      if (team.selector.agent) {
        lines.push(`    agent: ${team.selector.agent}`);
      }
      if (team.selector.selectorPrompt) {
        lines.push('    selectorPrompt: |');
        team.selector.selectorPrompt.split('\n').forEach(line => {
          lines.push(`      ${line}`);
        });
      }
    }

    if (team.graph && team.graph.edges && team.graph.edges.length > 0) {
      lines.push('  graph:');
      lines.push('    edges:');
      team.graph.edges.forEach(edge => {
        lines.push(`      - from: ${edge.from}`);
        lines.push(`        to: ${edge.to}`);
      });
    }

    return lines.join('\n');
  }, [team]);

  const handleDelete = async () => {
    if (!team) return;

    try {
      await teamsService.deleteById(team.id);
      toast.success('Team Deleted', {
        description: `Successfully deleted ${team.name}`,
      });
      router.push('/teams');
    } catch (error) {
      toast.error('Failed to Delete Team', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isViewing && !team) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Team not found</div>
      </div>
    );
  }

  const formSections = (
    <>
      <BasicInfoSection form={form} mode={mode} disabled={saving} />

      <StrategySection form={form} agents={agents} selectedMembers={selectedMembers} disabled={saving} />

      <MembersSection
        agents={agents}
        selectedMembers={selectedMembers}
        unavailableMembers={unavailableMembers}
        onMembersChange={setSelectedMembers}
        onDeleteUnavailable={member => {
          setUnavailableMembers(
            unavailableMembers.filter(m => m.name !== member.name),
          );
          setSelectedMembers(
            selectedMembers.filter(m => m.name !== member.name),
          );
        }}
        disabled={saving}
      />

      <SelectorSection
        form={form}
        agents={agents}
        unavailableAgents={unavailableMembers.map(m => m.name)}
        disabled={saving}
      />

      <GraphSection
        form={form}
        selectedMembers={selectedMembers}
        graphEdges={graphEdges}
        unavailableMembers={unavailableMembers}
        onGraphEdgesChange={setGraphEdges}
        disabled={saving}
      />

    </>
  );

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          breadcrumbs={breadcrumbs}
          currentPage={isCreating ? 'New Team' : team?.name || 'Team'}
          actions={
            isViewing ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/teams">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Link>
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={saving || !hasChanges}>
                  {saving ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ) : isCreating ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/teams">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Link>
                </Button>
                <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>
                  {saving ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Create Team
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {isViewing ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Left Panel - Configuration */}
          <div
            className={`flex h-full min-h-0 flex-col overflow-hidden border-r transition-all duration-300 ${
              isLeftPanelCollapsed ? 'w-0 border-r-0' : 'w-1/2'
            }`}>
            {!isLeftPanelCollapsed && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
                  <Settings className="text-muted-foreground h-4 w-4" />
                  <Select
                    value={teamName}
                    onValueChange={value =>
                      router.push(`/teams/${encodeURIComponent(value)}`)
                    }>
                    <SelectTrigger className="border-border h-8 w-[180px] bg-transparent px-2 text-sm font-medium">
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamsLoading ? (
                        <SelectItem value="loading" disabled>
                          Loading...
                        </SelectItem>
                      ) : (
                        allTeams.map(t => (
                          <SelectItem key={t.name} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={showYaml ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setShowYaml(!showYaml)}
                    className="h-7 gap-1 px-2 text-xs">
                    <Code className="h-3 w-3" />
                    YAML
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {showYaml ? (
                    <YamlViewer
                      yaml={teamYaml}
                      fileName={team?.name || 'team'}
                    />
                  ) : (
                    <div className="space-y-4 p-4">
                      <Form {...form}>{formSections}</Form>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <PanelToggleButton
            isCollapsed={isLeftPanelCollapsed}
            onToggle={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
          />

          {/* Right Panel - Chat */}
          <div
            className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ${
              isLeftPanelCollapsed ? 'w-full' : 'w-1/2'
            }`}>
            <EmbeddedChatPanel
              name={teamName || ''}
              type="team"
              strategy={team?.strategy}
              selectorAgentName={team?.selector?.agent ?? undefined}
              graphEdges={team?.graph?.edges}
            />
          </div>
        </div>
      ) : isCreating ? (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
              <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-3">
                <Settings className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">Team Configuration</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-4 p-4">{formSections}</div>
              </div>
            </div>
          </form>
        </Form>
      ) : null}

      {team && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Team"
          description={`Do you want to delete "${team.name}" team? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDelete}
          variant="destructive"
        />
      )}
    </div>
  );
}
