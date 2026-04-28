'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SkillMdEditor } from '@/components/editors/skill-md-editor';
import { SkillToolsPanel } from '@/components/editors/skill-tools-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  type Skill,
  buildFilesFromSkillMd,
  skillsService,
} from '@/lib/services/skills';

const DEFAULT_SKILL_MD = `---
description: One sentence — what does this skill do?
---

When the user asks about X, run \`do-thing\` then summarise with \`follow-up\`.
Embed each script as a fenced code block with a \`name=…\` attribute and Ark
will detect it as a tool.

\`\`\`bash name=do-thing.sh
#!/usr/bin/env bash
echo "hello from the skill"
\`\`\`

\`\`\`python name=follow-up.py
import sys
print("processed", sys.argv[1])
\`\`\`
`;

export type SkillEditorMode = 'create' | 'edit';

interface SkillEditorProps {
  mode: SkillEditorMode;
  /** Required when mode === 'edit'. */
  skillName?: string;
}

export function SkillEditor({ mode, skillName }: SkillEditorProps) {
  const { push } = useNamespacedNavigation();

  const [name, setName] = useState('');
  const [skillMd, setSkillMd] = useState(
    mode === 'create' ? DEFAULT_SKILL_MD : '',
  );
  const [initial, setInitial] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !skillName) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const found = await skillsService.getByName(skillName);
        if (cancelled) return;
        if (!found) {
          toast.error('Skill not found', { description: skillName });
          push('/skills');
          return;
        }
        setInitial(found);
        setName(found.name);
        setSkillMd(found.files['SKILL.md'] ?? '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, skillName, push]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!skillMd.trim()) {
      setError('SKILL.md is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const files = buildFilesFromSkillMd(skillMd, initial?.files);
      if (mode === 'create') {
        await skillsService.create({
          name: name.trim(),
          files,
        });
        toast.success('Skill created', { description: name.trim() });
      } else {
        await skillsService.update(name.trim(), { files });
        toast.success('Skill updated', { description: name.trim() });
      }
      push('/skills');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground py-8 text-sm">Loading skill…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 px-6 pt-4 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-md space-y-1.5">
          <Label htmlFor="skill-name">Name</Label>
          <Input
            id="skill-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="cobol-migrator"
            disabled={mode === 'edit'}
          />
        </div>

        <div className="flex flex-shrink-0 items-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => push('/skills')}
            disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}>
            {saving
              ? 'Saving…'
              : mode === 'create'
                ? 'Create skill'
                : 'Save changes'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col gap-2">
          <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            SKILL.md
          </Label>
          <SkillMdEditor
            value={skillMd}
            onChange={setSkillMd}
            placeholder={DEFAULT_SKILL_MD}
            className="min-h-[480px] flex-1"
          />
          <p className="text-muted-foreground text-xs">
            Frontmatter <code>description</code> drives the catalog. Mark a
            fenced block with <code>name=&lt;filename&gt;</code> and Ark will
            detect it as a tool — preview on the right.
          </p>
        </div>

        <div className="min-h-0 lg:max-h-[calc(100vh-220px)]">
          <SkillToolsPanel
            name={name}
            skillMd={skillMd}
            initialFiles={initial?.files}
          />
        </div>
      </div>
    </div>
  );
}
