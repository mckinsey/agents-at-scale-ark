'use client';

import { ArrowUpRightIcon, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { SkillRow } from '@/components/rows/skill-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useDelayedLoading, useSkills } from '@/lib/hooks';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { agentSkillAttachmentsService } from '@/lib/services/agent-skill-attachments';
import type { Skill } from '@/lib/services/skills';

export function SkillsSection() {
  const { skills, loading, refresh, remove } = useSkills();
  const showLoading = useDelayedLoading(loading);
  const { push } = useNamespacedNavigation();

  const openCreate = () => push('/skills/new');
  const openEdit = (skill: Skill) =>
    push(`/skills/${encodeURIComponent(skill.name)}/edit`);

  const handleDelete = async (skill: Skill) => {
    try {
      await remove(skill.name);
      await agentSkillAttachmentsService.forgetSkill(skill.name);
      toast.success('Skill deleted', { description: skill.name });
    } catch (error) {
      toast.error('Failed to delete skill', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      await refresh();
    }
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading…</div>
      </div>
    );
  }

  if (skills.length === 0 && !loading) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>No skills yet</EmptyTitle>
          <EmptyDescription>
            Bundle prose expertise with executable scripts and attach the
            result to your agents.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Create skill
          </Button>
        </EmptyContent>
        <Button
          variant="link"
          asChild
          className="text-muted-foreground"
          size="sm">
          <a
            href="https://github.com/mckinsey/agents-at-scale-ark/blob/main/openspec/changes/agent-skills/proposal.md"
            target="_blank"
            rel="noopener noreferrer">
            Read the proposal <ArrowUpRightIcon />
          </a>
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="mt-4 flex-1 overflow-auto">
        <div className="mb-4 flex">
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Create skill
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {skills.map(skill => (
            <SkillRow
              key={skill.name}
              skill={skill}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
