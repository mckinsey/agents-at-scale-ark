import { useQuery } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import { a2aTasksService } from './a2a-tasks';

export function useListA2ATasks() {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: ['a2a-tasks', namespace],
    queryFn: async () => {
      const items = await a2aTasksService.getAll(namespace);
      return { items, count: items.length };
    },
    enabled: Boolean(namespace),
  });
}

export function useA2ATask(id: string) {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: ['a2a-tasks', id, namespace],
    queryFn: () => a2aTasksService.get(namespace, id),
    enabled: Boolean(id && namespace),
  });
}
