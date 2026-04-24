import { useQuery } from '@tanstack/react-query';
import { participantsService } from './participants';

export const useParticipants = () => {
  return useQuery({
    queryKey: ['participants'],
    queryFn: () => participantsService.getAll(),
    staleTime: 30000,
  });
};
