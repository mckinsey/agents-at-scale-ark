'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import { PanelToggleButton } from '@/components/common/panel-toggle-button';
import { YamlViewer } from '@/components/common/yaml-viewer';
import { ChevronLeft, Code, Warning } from '@/components/icons';
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

export function TeamForm({ mode, teamName, onSuccess }: TeamFormProps) {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [showYaml, setShowYaml] = useState(false);

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

  const displayName = team?.name || '';

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden px-20 pb-10">
      <header className="flex flex-none flex-col gap-4 pt-10 pb-5">
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
              {displayName}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <NamespacedLink href="/teams">
              <Button variant="outline">Back</Button>
            </NamespacedLink>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={saving || !hasChanges || readOnlyMode}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <h1 className="text-fg-primary text-xl leading-7">{displayName}</h1>
          {hasChanges && (
            <div className="flex items-center gap-1">
              <IconShell size="sm" className="text-status-warning opacity-100">
                <Warning />
              </IconShell>
              <span className="text-fg-primary text-sm leading-5 tracking-[-0.112px]">
                You have unsaved changes
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`border-stroke-divider flex h-full min-h-0 flex-col overflow-hidden border-r transition-all duration-300 ${
            isLeftPanelCollapsed ? 'w-0 border-r-0' : 'w-1/2'
          }`}>
          {!isLeftPanelCollapsed && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="bg-surface-secondary border-stroke-divider flex items-center gap-2 border-b px-5 py-2">
                <Select
                  value={teamName}
                  onValueChange={value =>
                    push(`/teams/${encodeURIComponent(value as string)}`)
                  }>
                  <SelectTrigger className="!h-8 !w-auto !gap-1 !border-0 !bg-transparent !p-0 text-sm font-medium !shadow-none hover:!bg-transparent focus:!ring-0 focus-visible:!bg-transparent focus-visible:!ring-0 data-[popup-open]:!bg-transparent">
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
                  size="xs"
                  onClick={() => setShowYaml(!showYaml)}
                  className="gap-1">
                  <IconShell size="sm">
                    <Code />
                  </IconShell>
                  YAML
                </Button>
              </div>
              <ScrollArea className="h-0 min-h-0 flex-1">
                {showYaml ? (
                  <YamlViewer yaml={teamYaml} fileName={team?.name || 'team'} />
                ) : (
                  <div className="flex flex-col gap-6 px-5 pt-5 pb-6">
                    <Form {...form}>{formSections}</Form>
                  </div>
                )}
              </ScrollArea>
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
    </div>
  );
}
