'use client';

import { ArrowLeft, Code, Save, Settings, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { PanelToggleButton } from '@/components/common/panel-toggle-button';
import { YamlViewer } from '@/components/common/yaml-viewer';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { Team } from '@/lib/services';
import { teamsService } from '@/lib/services';
import { toKubernetesYaml } from '@/lib/utils/kubernetes-yaml';
import { useNamespace } from '@/providers/NamespaceProvider';

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
  { href: '/', label: 'Ark Dashboard' },
  { href: '/teams', label: 'Teams' },
];

export function TeamForm({ mode, teamName, onSuccess }: TeamFormProps) {
  const { push } = useNamespacedNavigation();
  const { namespace } = useNamespace();
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

  const [teamYaml, setTeamYaml] = useState('');

  const fetchTeamYaml = useCallback(async (name: string) => {
    try {
      const raw = await teamsService.getRawResource(name);
      setTeamYaml(toKubernetesYaml(raw));
    } catch {
      setTeamYaml('');
    }
  }, []);

  useEffect(() => {
    if (team?.name && showYaml) {
      fetchTeamYaml(team.name);
    }
  }, [team?.name, showYaml, fetchTeamYaml]);

  const prevSavingRef = useRef(false);
  useEffect(() => {
    if (prevSavingRef.current && !saving && team?.name && showYaml) {
      fetchTeamYaml(team.name);
    }
    prevSavingRef.current = saving;
  }, [saving, team?.name, showYaml, fetchTeamYaml]);

  const handleDelete = async () => {
    if (!team) return;

    try {
      await teamsService.deleteById(team.id);
      toast.success('Team Deleted', {
        description: `Successfully deleted ${team.name}`,
      });
      push('/teams');
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
        <div className="text-fg-secondary">Team not found</div>
      </div>
    );
  }

  const formSections = (
    <>
      <BasicInfoSection form={form} mode={mode} disabled={saving} />

      <StrategySection
        form={form}
        agents={agents}
        selectedMembers={selectedMembers}
        disabled={saving}
      />

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

  if (isCreating) {
    return (
      <div className="absolute inset-0 flex flex-col gap-5 overflow-hidden px-12 pt-10">
        <header className="flex flex-none flex-col gap-4">
          <div className="flex items-center justify-between">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
              <NamespacedLink
                href="/teams"
                className="text-fg-disabled hover:text-fg-secondary flex items-center gap-1 transition-colors">
                <IconShell size="sm" className="opacity-100">
                  <ChevronLeft />
                </IconShell>
                Teams
              </NamespacedLink>
              <span aria-hidden="true" className="text-fg-secondary">
                /
              </span>
              <span aria-current="page" className="text-fg-secondary">
                Create team
              </span>
            </nav>
            <div className="flex items-center gap-2">
              <NamespacedLink href="/teams">
                <Button variant="outline">Cancel</Button>
              </NamespacedLink>
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={saving}>
                {saving && <Spinner className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </div>
          </div>
          <h1 className="text-fg-primary text-xl leading-7">
            New team configuration
          </h1>
        </header>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col">
            <ScrollArea type="scroll" className="h-0 min-h-0 flex-1">
              <div className="flex w-full max-w-[720px] flex-col gap-6 pb-6">
                {formSections}
              </div>
            </ScrollArea>
          </form>
        </Form>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          breadcrumbs={breadcrumbs}
          currentPage={team?.name || 'Team'}
          actions={
            isViewing ? (
              <div className="flex items-center gap-2">
                <NamespacedLink href="/teams">
                  <Button variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </NamespacedLink>
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
            ) : null
          }
        />
      </div>

      {isViewing && (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
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
                      push(`/teams/${encodeURIComponent(value as string)}`)
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
      )}

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
