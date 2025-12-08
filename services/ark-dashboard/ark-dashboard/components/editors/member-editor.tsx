import { ChevronRight, CircleAlert, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TeamMember } from '@/lib/services';

interface TeamMemberSelectionProps {
  unavailableMembers: TeamMember[];
  onDeleteMember: (member: TeamMember) => void;
}

const MemberItem = ({
  member,
  index,
  onDelete,
}: {
  member: TeamMember;
  index: number;
  onDelete: (member: TeamMember) => void;
}) => (
  <div
    className="flex flex-row justify-between"
    key={`${member.name}-${index}`}>
    <div className="flex w-fit items-start space-x-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="text-left" asChild>
            <CircleAlert className="mt-1 h-4 w-4 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>This member is unavailable in the system</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="flex items-center gap-1 text-sm">{member!.name}</span>
    </div>
    <div>
      <Button
        variant={'ghost'}
        size="sm"
        className="h-8 w-8 p-0 hover:text-red-500"
        onClick={() => onDelete(member)}
        aria-label={'Delete member'}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export function TeamMemberSelectionSection({
  unavailableMembers,
  onDeleteMember,
}: Readonly<TeamMemberSelectionProps>) {
  return (
    <div className="grid gap-2" hidden={unavailableMembers.length === 0}>
      <Label>Unavailable Members</Label>
      <div className="space-y-2">
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
          <Collapsible
            defaultOpen
            className="group/collapsible"
            key="unavailableMembers">
            <div className="p-2">
              <CollapsibleTrigger className="w-full">
                <div className="flex w-full flex-row items-center justify-between">
                  <span className="text-sm font-medium">
                    {unavailableMembers.length} unavailable member
                    {unavailableMembers.length !== 1 ? 's' : ''}
                  </span>
                  <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-y-2 pt-2">
                  {unavailableMembers.map((member, index) => (
                    <MemberItem
                      key={member.name + `${index}`}
                      index={index}
                      member={member}
                      onDelete={onDeleteMember}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
