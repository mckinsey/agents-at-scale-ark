import { useCallback } from 'react';

import { Group, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { IconShell } from '@/components/ui/icon-shell';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Agent, TeamMember } from '@/lib/services';

interface MembersSectionProps {
  agents: Agent[];
  selectedMembers: TeamMember[];
  unavailableMembers: TeamMember[];
  onMembersChange: (members: TeamMember[]) => void;
  onDeleteUnavailable: (member: TeamMember) => void;
  disabled?: boolean;
}

function MemberRow({
  agent,
  isSelected,
  onToggle,
}: {
  agent: Agent;
  isSelected: boolean;
  onToggle: (agent: Agent) => void;
}) {
  return (
    <div className="hover:bg-stateslayer-overlay-hover flex items-start space-x-2 p-2">
      <Checkbox
        id={`agent-${agent.id}`}
        checked={isSelected}
        onCheckedChange={() => onToggle(agent)}
        className="mt-1"
      />
      <Label
        htmlFor={`agent-${agent.id}`}
        className="flex-1 cursor-pointer text-sm font-normal">
        <div className="font-medium">{agent.name}</div>
        {agent.description && (
          <div className="text-fg-tertiary text-xs">{agent.description}</div>
        )}
      </Label>
    </div>
  );
}

export function MembersSection({
  agents,
  selectedMembers,
  unavailableMembers,
  onMembersChange,
  onDeleteUnavailable,
  disabled: _disabled,
}: Readonly<MembersSectionProps>) {
  const orderedAgents = [
    ...selectedMembers
      .map(m => agents.find(a => a.name === m.name))
      .filter((a): a is Agent => a !== undefined),
    ...agents.filter(a => !selectedMembers.some(m => m.name === a.name)),
  ];

  const toggleMember = useCallback(
    (agent: Agent) => {
      const exists = selectedMembers.some(m => m.name === agent.name);
      if (exists) {
        onMembersChange(selectedMembers.filter(m => m.name !== agent.name));
      } else {
        onMembersChange([
          ...selectedMembers,
          { name: agent.name, type: 'agent' },
        ]);
      }
    },
    [selectedMembers, onMembersChange],
  );

  const removeMember = useCallback(
    (name: string) => {
      onMembersChange(selectedMembers.filter(m => m.name !== name));
    },
    [selectedMembers, onMembersChange],
  );

  const selectedTags = selectedMembers.filter(
    m => !unavailableMembers.some(u => u.name === m.name),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconShell size="sm" variant="secondary">
          <Group />
        </IconShell>
        <h3 className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
          Team Members
        </h3>
      </div>

      <div className="space-y-2">
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(member => (
              <Tag
                key={member.name}
                size="xs"
                variant="primary"
                onRemove={() => removeMember(member.name)}>
                {member.name}
              </Tag>
            ))}
          </div>
        )}
        <ScrollArea className="border-stroke-tertiary border [&_[data-slot=scroll-area-viewport]]:max-h-48">
          <div className="space-y-2 p-2">
            {unavailableMembers.length > 0 && (
              <Collapsible defaultOpen className="group/collapsible">
                <div className="p-2">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex w-full flex-row items-center justify-between">
                      <Label>Unavailable Members</Label>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="flex flex-col gap-y-2 pt-2">
                      {unavailableMembers.map(member => (
                        <div
                          key={member.name}
                          className="flex flex-row justify-between">
                          <div className="flex w-fit items-start space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger
                                  className="text-left"
                                  tabIndex={-1}>
                                  <span className="text-status-error mt-1 block">
                                    <IconShell size="sm" variant="primary">
                                      <Warning />
                                    </IconShell>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    This member is unavailable in the system
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Label className="flex-1 cursor-pointer text-sm font-normal">
                              <div className="font-medium">{member.name}</div>
                            </Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDeleteUnavailable(member)}
                            aria-label="Delete member">
                            <IconShell size="sm" variant="secondary">
                              <Trash />
                            </IconShell>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
            {orderedAgents.map(agent => (
              <MemberRow
                key={agent.name}
                agent={agent}
                isSelected={selectedMembers.some(m => m.name === agent.name)}
                onToggle={toggleMember}
              />
            ))}
          </div>
        </ScrollArea>
        <p className="text-fg-tertiary text-xs">
          {selectedMembers.length} member
          {selectedMembers.length !== 1 ? 's' : ''} selected
        </p>
      </div>
    </div>
  );
}
