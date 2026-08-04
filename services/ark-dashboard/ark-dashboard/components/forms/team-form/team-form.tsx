'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import { ResourceStudioLayout } from '@/components/common/resource-studio-layout';
import { YamlViewer } from '@/components/common/yaml-viewer';
import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { TeamListItem } from '@/lib/services/teams';
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
  const [allTeams, setAllTeams] = useState<TeamListItem[]>([]);
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
      <div className="flex min-h-0 w-full content-shell flex-1 flex-col gap-5 overflow-hidden">
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
              <div className="flex w-full max-w-[576px] flex-col gap-6 pb-6 pl-px pr-2">
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
    <ResourceStudioLayout
      listHref="/teams"
      listLabel="Teams"
      displayName={displayName}
      saving={saving}
      hasChanges={hasChanges}
      readOnlyMode={readOnlyMode}
      onSave={form.handleSubmit(onSubmit)}
      switcherValue={teamName}
      switcherPlaceholder="Select team"
      switcherItems={allTeams}
      switcherLoading={teamsLoading}
      onSwitcherSelect={value => push(`/teams/${encodeURIComponent(value)}`)}
      showYaml={showYaml}
      onToggleYaml={() => setShowYaml(!showYaml)}
      yamlContent={
        <YamlViewer yaml={teamYaml} fileName={team?.name || 'team'} />
      }
      formContent={
        <div className="flex flex-col gap-6 px-5 pt-5 pb-6">
          <Form {...form}>{formSections}</Form>
        </div>
      }
      chatPanel={
        <EmbeddedChatPanel
          name={teamName || ''}
          type="team"
          strategy={team?.strategy}
          selectorAgentName={team?.selector?.agent ?? undefined}
          graphEdges={team?.graph?.edges}
        />
      }
    />
  );
}
