'use client';

import { Badge } from '@/components/ui/badge';
import { FieldSet, FieldTitle } from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { SkillsDisplaySectionProps } from '../types';

export function SkillsDisplaySection({ skills }: SkillsDisplaySectionProps) {
  return (
    <FieldSet className="gap-2">
      <FieldTitle>Skills</FieldTitle>
      {skills.length === 0 ? (
        <p className="label-regular-primary text-fg-secondary">
          No skills available for this agent
        </p>
      ) : (
        <ScrollArea className="border-stroke-divider border [&_[data-slot=scroll-area-viewport]]:max-h-[300px]">
          <ul className="divide-stroke-divider flex flex-col divide-y px-3">
            {skills.map((skill, index) => (
              <li
                key={`${skill.id}-${index}`}
                className="flex flex-col gap-1 py-3">
                <span className="label-regular-primary text-fg-primary">
                  {skill.name}
                </span>
                {skill.description && (
                  <span className="label-regular-primary text-fg-secondary">
                    {skill.description}
                  </span>
                )}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {skill.tags.map((tag, tagIndex) => (
                      <Badge
                        key={`${tag}-${tagIndex}`}
                        variant="alternative"
                        size="sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </FieldSet>
  );
}
