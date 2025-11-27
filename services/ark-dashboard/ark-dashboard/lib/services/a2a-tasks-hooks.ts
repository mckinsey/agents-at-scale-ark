import { useQuery } from '@tanstack/react-query';

import { a2aTasksService } from './a2a-tasks';

export function useListA2ATasks() {
  return useQuery({
    queryKey: ['a2a-tasks'],
    queryFn: async () => {
      const items = await a2aTasksService.getAll();
      return { items, count: items.length };
    },
  });
}

export function useA2ATask(id: string) {
  return useQuery({
    queryKey: ['a2a-tasks', id],
    queryFn: () => a2aTasksService.get(id),
    enabled: !!id,
  });
}
