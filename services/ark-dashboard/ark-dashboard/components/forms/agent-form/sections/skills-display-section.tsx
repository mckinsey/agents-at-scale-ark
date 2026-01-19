'use client';

import type { SkillsDisplaySectionProps } from '../types';

export function SkillsDisplaySection({ skills }: SkillsDisplaySectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Skills
      </h3>
      {skills.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No skills available for this agent
        </div>
      ) : (
        <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-md border p-3">
          {skills.map((skill, index) => (
            <div
              key={`${skill.id}-${index}`}
              className="space-y-1 rounded border-l-2 border-blue-500/50 bg-blue-500/5 p-3">
              <div className="text-sm font-medium">{skill.name}</div>
              {skill.description && (
                <div className="text-xs text-muted-foreground">
                  {skill.description}
                </div>
              )}
              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {skill.tags.map((tag, tagIndex) => (
                    <span
                      key={`${tag}-${tagIndex}`}
                      className="inline-block rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

