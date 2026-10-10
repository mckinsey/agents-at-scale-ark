'use client';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { SkillsDisplaySectionProps } from '../types';

export function SkillsDisplaySection({ skills }: SkillsDisplaySectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-fg-secondary text-sm font-semibold tracking-wide uppercase">
        Skills
      </h3>
      {skills.length === 0 ? (
        <div className="text-fg-secondary text-sm">
          No skills available for this agent
        </div>
      ) : (
        <ScrollArea className="border-stroke-divider border [&_[data-slot=scroll-area-viewport]]:max-h-[300px]">
          <div className="space-y-2 p-3">
          {skills.map((skill, index) => (
            <div
              key={`${skill.id}-${index}`}
              className="border-brand-accents-qb-accent/50 bg-brand-accents-qb-accent/5 space-y-1 border-l-2 p-3">
              <div className="text-fg-primary text-sm font-medium">
                {skill.name}
              </div>
              {skill.description && (
                <div className="text-fg-tertiary text-xs">
                  {skill.description}
                </div>
              )}
              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {skill.tags.map((tag, tagIndex) => (
                    <span
                      key={`${tag}-${tagIndex}`}
                      className="bg-brand-accents-qb-accent/10 text-brand-accents-qb-accent inline-block px-2 py-0.5 text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
