import { useQuery } from '@tanstack/react-query';

import { a2aTasksService } from './a2a-tasks';

export function useListA2ATasks(namespace?: string) {
  return useQuery({
    queryKey: ['a2a-tasks', namespace],
    queryFn: async () => {
      const items = await a2aTasksService.getAll(namespace);
      return { items, count: items.length };
    },
  });
}

export function useA2ATask(id: string, namespace?: string) {
  return useQuery({
    queryKey: ['a2a-tasks', id, namespace],
    queryFn: () => a2aTasksService.get(id, namespace),
    enabled: !!id,
  });
}
