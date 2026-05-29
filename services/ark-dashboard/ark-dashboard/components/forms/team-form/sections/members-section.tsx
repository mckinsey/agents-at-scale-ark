import { useCallback, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { DragIndicator, Group, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Agent, TeamMember } from '@/lib/services';

const ItemTypes = { CARD: 'card' };

interface MembersSectionProps {
  agents: Agent[];
  selectedMembers: TeamMember[];
  unavailableMembers: TeamMember[];
  onMembersChange: (members: TeamMember[]) => void;
  onDeleteUnavailable: (member: TeamMember) => void;
  disabled?: boolean;
}

function DraggableCard({
  index,
  agent,
  isSelected,
  onToggle,
  moveCard,
}: {
  index: number;
  agent: Agent;
  isSelected: boolean;
  onToggle: (agent: Agent) => void;
  moveCard: (dragIndex: number, hoverIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [, drop] = useDrop({
    accept: ItemTypes.CARD,
    hover(item: { index: number }) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      moveCard(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging: _isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: { index },
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className="hover:bg-stateslayer-overlay-hover flex items-start space-x-2 p-2">
      <span className="text-fg-tertiary mt-1 cursor-move">
        <IconShell size="sm" variant="secondary">
          <DragIndicator />
        </IconShell>
      </span>
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
          <div className="text-fg-tertiary text-xs">
            {agent.description}
          </div>
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

  const moveCard = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const reordered = [...orderedAgents];
      const [removed] = reordered.splice(dragIndex, 1);
      reordered.splice(hoverIndex, 0, removed);
      const updatedSelected = reordered
        .filter(agent => selectedMembers.some(m => m.name === agent.name))
        .map(agent => ({ name: agent.name, type: 'agent' as const }));
      onMembersChange(updatedSelected);
    },
    [orderedAgents, selectedMembers, onMembersChange],
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
        <ScrollArea className="border-stroke-tertiary border [&_[data-slot=scroll-area-viewport]]:max-h-48">
          <DndProvider backend={HTML5Backend}>
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
            {orderedAgents.map((agent, index) => {
              const isSelected = selectedMembers.some(
                m => m.name === agent.name,
              );
              return (
                <DraggableCard
                  key={agent.name}
                  index={index}
                  agent={agent}
                  isSelected={isSelected}
                  onToggle={toggleMember}
                  moveCard={moveCard}
                />
              );
            })}
           </div>
          </DndProvider>
        </ScrollArea>
        <p className="text-fg-tertiary text-xs">
          {selectedMembers.length} member
          {selectedMembers.length !== 1 ? 's' : ''} selected
        </p>
      </div>
    </div>
  );
}
