'use client';

import { FileText, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import {
  type Skill,
  buildFilesFromSkillMd,
  discoverScripts,
  parseSkillMd,
} from '@/lib/services/skills';

interface SkillToolsPanelProps {
  /** The current skill name being edited (used for tool-name preview). */
  name: string;
  /** Live SKILL.md content from the editor. */
  skillMd: string;
  /** When editing, the skill's existing files map (so reference files persist). */
  initialFiles?: Record<string, string>;
}

export function SkillToolsPanel({
  name,
  skillMd,
  initialFiles,
}: SkillToolsPanelProps) {
  const parsed = useMemo(() => parseSkillMd(skillMd), [skillMd]);

  const previewSkill: Skill | null = useMemo(() => {
    if (!name.trim()) return null;
    return {
      name: name.trim(),
      files: buildFilesFromSkillMd(skillMd, initialFiles),
      createdAt: '',
      updatedAt: '',
    };
  }, [name, skillMd, initialFiles]);

  const discovered = useMemo(
    () => (previewSkill ? discoverScripts(previewSkill) : []),
    [previewSkill],
  );

  return (
    <div className="bg-card flex h-full flex-col overflow-y-auto rounded-md border">
      <div className="border-b px-4 py-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Detected tools
        </h2>
        <p className="mt-1 text-xs">
          {!name.trim() ? (
            <span className="text-muted-foreground italic">
              Set a name to preview tool names.
            </span>
          ) : discovered.length === 0 ? (
            <span className="text-muted-foreground">
              No fenced blocks with{' '}
              <code className="font-mono">name=…</code> found yet.
            </span>
          ) : (
            <span>
              {discovered.length} tool{discovered.length === 1 ? '' : 's'} will
              be exposed to the agent.
            </span>
          )}
        </p>
      </div>

      {discovered.length > 0 && (
        <ul className="divide-y">
          {discovered.map(d => (
            <li
              key={d.path}
              className="flex items-start gap-3 px-4 py-3 text-xs">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-emerald-700 dark:text-emerald-400">
                  {d.toolName}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate font-mono">
                  ← {d.path}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t px-4 py-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Catalog entry
        </h2>
        <p className="mt-2 text-sm">
          {parsed.description ? (
            <>
              <span className="font-mono">{name.trim() || '<name>'}</span>
              <span className="text-muted-foreground">: </span>
              {parsed.description}
            </>
          ) : (
            <span className="text-muted-foreground italic">
              Add <code className="font-mono">description: …</code> to your
              SKILL.md frontmatter.
            </span>
          )}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          This is the line agents will see in their skill catalog. The full
          body lands in context only when the model calls{' '}
          <code className="font-mono">load_skill</code>.
        </p>
      </div>

      <div className="text-muted-foreground border-t px-4 py-3 text-xs">
        <div className="flex items-center justify-between">
          <span>Runner</span>
          <span className="bg-muted rounded px-2 py-0.5 font-mono">
            ark-skill-runner:v1
          </span>
        </div>
        <p className="mt-1 text-[11px]">
          Bash, Python and Node — language is dispatched per script via shebang
          or extension.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Reference files
          </span>
          <span>
            {previewSkill
              ? Object.keys(previewSkill.files).filter(
                  p => p !== 'SKILL.md' && !p.startsWith('scripts/'),
                ).length
              : 0}
          </span>
        </div>
      </div>
    </div>
  );
}
