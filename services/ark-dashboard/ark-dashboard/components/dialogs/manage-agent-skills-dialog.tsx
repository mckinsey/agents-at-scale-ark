'use client';

import { ArrowUpRightIcon, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAgentSkillAttachments,
  useSkills,
} from '@/lib/hooks';
import { getDescription } from '@/lib/services/skills';

interface ManageAgentSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
}

export function ManageAgentSkillsDialog({
  open,
  onOpenChange,
  agentName,
}: ManageAgentSkillsDialogProps) {
  const { skills, loading: skillsLoading } = useSkills();
  const { attached, loading: attachedLoading, setAttached } =
    useAgentSkillAttachments(open ? agentName : null);

  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(new Set(attached));
  }, [open, attached]);

  const toggle = (name: string) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setAttached([...draft]);
      toast.success('Skills updated', { description: agentName });
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to update skills', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  const loading = skillsLoading || attachedLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage skills for {agentName}</DialogTitle>
          <DialogDescription>
            Attached skills are exposed to the agent via lazy-load — only the
            description is in the system prompt until the model calls{' '}
            <code className="text-xs">load_skill</code>.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            Loading…
          </div>
        ) : skills.length === 0 ? (
          <div className="rounded-md border p-6 text-center">
            <Sparkles className="text-muted-foreground mx-auto h-8 w-8" />
            <p className="mt-3 text-sm font-medium">No skills exist yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Create one on the Skills page first.
            </p>
            <Button
              variant="link"
              asChild
              className="text-muted-foreground mt-2"
              size="sm">
              <a href="/skills">
                Go to Skills <ArrowUpRightIcon className="ml-1 h-3 w-3" />
              </a>
            </Button>
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-3">
            {skills.map(skill => {
              const checked = draft.has(skill.name);
              return (
                <label
                  key={skill.name}
                  className="hover:bg-accent/30 flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(skill.name)}
                    className="mt-1"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate text-sm font-medium">
                        {skill.name}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {getDescription(skill) || (
                        <span className="italic">
                          no description in SKILL.md
                        </span>
                      )}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : `Save (${draft.size} attached)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
