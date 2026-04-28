'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  type Skill,
  skillsService,
} from '@/lib/services/skills';

export interface UseSkillsResult {
  skills: Skill[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (
    skill: Omit<Skill, 'createdAt' | 'updatedAt'>,
  ) => Promise<Skill>;
  update: (
    name: string,
    patch: Partial<Omit<Skill, 'name' | 'createdAt' | 'updatedAt'>>,
  ) => Promise<Skill>;
  remove: (name: string) => Promise<void>;
}

export function useSkills(): UseSkillsResult {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await skillsService.list();
      setSkills(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback<UseSkillsResult['create']>(
    async skill => {
      const created = await skillsService.create(skill);
      await refresh();
      return created;
    },
    [refresh],
  );

  const update = useCallback<UseSkillsResult['update']>(
    async (name, patch) => {
      const updated = await skillsService.update(name, patch);
      await refresh();
      return updated;
    },
    [refresh],
  );

  const remove = useCallback<UseSkillsResult['remove']>(
    async name => {
      await skillsService.delete(name);
      await refresh();
    },
    [refresh],
  );

  return { skills, loading, refresh, create, update, remove };
}
