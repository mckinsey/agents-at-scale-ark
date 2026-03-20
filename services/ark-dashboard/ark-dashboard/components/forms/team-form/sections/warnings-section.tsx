import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Agent, TeamMember } from '@/lib/services';

interface WarningsSectionProps {
  agents: Agent[];
  selectedMembers: TeamMember[];
  strategy: string;
  selectorAgent?: string;
}

export function WarningsSection({
  agents,
  selectedMembers,
  strategy,
  selectorAgent,
}: Readonly<WarningsSectionProps>) {
  if (strategy !== 'selector' || selectedMembers.length === 0) {
    return null;
  }

  const selectedMemberNames = new Set(selectedMembers.map(m => m.name));
  const selectedAgents = agents.filter(a => selectedMemberNames.has(a.name));

  const hasTerminate = (agent: Agent) =>
    agent.tools?.some(t => t.type === 'builtin' && t.name === 'terminate') ?? false;

  const noAgentHasTerminate = selectedAgents.length > 0 && !selectedAgents.some(hasTerminate);

  const resolvedSelectorAgent = selectorAgent === '__none__' ? undefined : selectorAgent;
  const selectorAgentObj = resolvedSelectorAgent
    ? selectedAgents.find(a => a.name === resolvedSelectorAgent)
    : undefined;
  const selectorAgentLacksTerminate = selectorAgentObj != null && !hasTerminate(selectorAgentObj);

  if (!noAgentHasTerminate && !selectorAgentLacksTerminate) {
    return null;
  }

  return (
    <>
      {noAgentHasTerminate && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No agent in this team has the terminate tool. The team may not be able to end the conversation gracefully.
          </AlertDescription>
        </Alert>
      )}
      {selectorAgentLacksTerminate && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The selector agent does not have the terminate tool.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
