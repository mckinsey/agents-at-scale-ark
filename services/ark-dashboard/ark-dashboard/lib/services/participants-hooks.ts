import { useQuery } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import { participantsService } from './participants';

export const useParticipants = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: ['participants', namespace],
    queryFn: () => participantsService.getAll(namespace),
    enabled: Boolean(namespace),
    staleTime: 30000,
  });
};
