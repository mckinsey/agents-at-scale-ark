'use client';

import { Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  discoverScripts,
  getDescription,
  type Skill,
} from '@/lib/services/skills';

interface SkillRowProps {
  readonly skill: Skill;
  readonly onEdit?: (skill: Skill) => void;
  readonly onDelete?: (skill: Skill) => void;
}

export function SkillRow({ skill, onEdit, onDelete }: SkillRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const description = useMemo(() => getDescription(skill), [skill]);
  const scriptCount = useMemo(() => discoverScripts(skill).length, [skill]);

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3 shadow-sm transition-colors">
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <Sparkles className="text-muted-foreground h-5 w-5 flex-shrink-0" />
          <div className="flex max-w-[600px] min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium" title={skill.name}>
              {skill.name}
            </p>
            <p
              className="text-muted-foreground truncate text-xs"
              title={description}>
              {description || (
                <span className="italic">no description in SKILL.md</span>
              )}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground flex flex-shrink-0 items-center gap-3 text-xs">
          <span>
            {scriptCount} script{scriptCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onEdit(skill)}
                    aria-label={`Edit skill ${skill.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit skill</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:text-red-500"
                    onClick={() => setConfirmOpen(true)}
                    aria-label={`Delete skill ${skill.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete skill</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {onDelete && (
        <ConfirmationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete skill"
          description={`Delete "${skill.name}"? Any agent it's attached to will lose access on next reconcile.`}
          confirmText="Delete"
          onConfirm={() => onDelete(skill)}
          variant="destructive"
        />
      )}
    </>
  );
}
