'use client';

import { useCallback, useState } from 'react';

import { ChevronDown, Warning } from '@/components/icons';
import { NumericBadge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FieldDescription,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Agent, TeamMember } from '@/lib/services';
import { cn } from '@/lib/utils';

interface MembersSectionProps {
  agents: Agent[];
  selectedMembers: TeamMember[];
  unavailableMembers: TeamMember[];
  onMembersChange: (members: TeamMember[]) => void;
  onDeleteUnavailable: (member: TeamMember) => void;
  disabled?: boolean;
}

const MAX_VISIBLE_TAGS = 4;

export function MembersSection({
  agents,
  selectedMembers,
  unavailableMembers,
  onMembersChange,
  onDeleteUnavailable,
  disabled = false,
}: Readonly<MembersSectionProps>) {
  const [open, setOpen] = useState(false);

  const isUnavailable = useCallback(
    (name: string) => unavailableMembers.some(u => u.name === name),
    [unavailableMembers],
  );

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
    (member: TeamMember) => {
      if (isUnavailable(member.name)) {
        onDeleteUnavailable(member);
      } else {
        onMembersChange(selectedMembers.filter(m => m.name !== member.name));
      }
    },
    [isUnavailable, onDeleteUnavailable, onMembersChange, selectedMembers],
  );

  const visibleMembers = selectedMembers.slice(0, MAX_VISIBLE_TAGS);
  const overflowCount = selectedMembers.length - visibleMembers.length;
  const triggerDisabled = disabled;

  return (
    <FieldSet className="gap-2">
      <FieldTitle>Team Members</FieldTitle>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-disabled={triggerDisabled || undefined}
            tabIndex={triggerDisabled ? -1 : 0}
            onKeyDown={e => {
              if ((e.key === 'Enter' || e.key === ' ') && !triggerDisabled) {
                e.preventDefault();
                setOpen(o => !o);
              }
            }}
            className={cn(
              'flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 border-0 border-b border-white/[0.24] bg-transparent px-0 py-1 text-left transition-colors',
              'focus-visible:border-b-stroke-status-focus data-[state=open]:border-b-stroke-status-focus hover:border-b-white/40 focus-visible:outline-none',
              'aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
            )}>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {selectedMembers.length === 0 ? (
                <span className="text-fg-tertiary text-sm leading-5 tracking-[-0.028px]">
                  Select members
                </span>
              ) : (
                <>
                  {visibleMembers.map(member => {
                    const unavailable = isUnavailable(member.name);
                    return (
                      <Tag
                        key={member.name}
                        size="xs"
                        variant={unavailable ? 'outline' : 'primary'}
                        onPointerDown={e => e.stopPropagation()}
                        onRemove={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeMember(member);
                        }}>
                        {unavailable && (
                          <IconShell
                            size="sm"
                            className="text-status-warning opacity-100">
                            <Warning />
                          </IconShell>
                        )}
                        {member.name}
                      </Tag>
                    );
                  })}
                  {overflowCount > 0 && (
                    <NumericBadge size="sm" variant="primary">
                      {overflowCount}
                    </NumericBadge>
                  )}
                </>
              )}
            </div>
            <ChevronDown
              className={cn(
                'text-fg-secondary size-4 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          avoidCollisions={false}
          collisionPadding={8}
          role="listbox"
          aria-multiselectable="true"
          className="bg-fill-onsurface-ui-2 shadow-elevation-2 w-[var(--radix-popover-trigger-width)] rounded-none border-0 p-1">
          {agents.length === 0 ? (
            <p className="text-fg-secondary px-3 py-2 text-sm">
              No agents available in this namespace.
            </p>
          ) : (
            <ScrollArea className="[&_[data-slot=scroll-area-viewport]]:max-h-[min(320px,var(--radix-popover-content-available-height))]">
              <ul className="flex flex-col">
                {agents.map(agent => {
                  const checked = selectedMembers.some(
                    m => m.name === agent.name,
                  );
                  const description = agent.description?.trim();
                  return (
                    <li key={agent.name} role="option" aria-selected={checked}>
                      <label className="hover:bg-stateslayer-overlay-hover flex h-9 cursor-pointer items-center gap-2 px-1">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleMember(agent)}
                          disabled={disabled}
                          aria-label={agent.name}
                        />
                        {description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-fg-primary cursor-pointer text-sm leading-5 tracking-[-0.028px]">
                                {agent.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="start">
                              {description}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-fg-primary text-sm leading-5 tracking-[-0.028px]">
                            {agent.name}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </PopoverContent>
      </Popover>
      <FieldDescription>
        {selectedMembers.length} member
        {selectedMembers.length !== 1 ? 's' : ''} selected
      </FieldDescription>
    </FieldSet>
  );
}
