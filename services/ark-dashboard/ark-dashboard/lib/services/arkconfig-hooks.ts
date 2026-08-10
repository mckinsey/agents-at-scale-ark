import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  type ArkConfigUpdateRequest,
  arkConfigService,
} from './arkconfig';

const ARK_CONFIG_KEY = ['arkconfig'] as const;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
};

export const useArkConfig = () => {
  return useQuery({
    queryKey: ARK_CONFIG_KEY,
    queryFn: () => arkConfigService.get(),
  });
};

export const useUpdateArkConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ArkConfigUpdateRequest) =>
      arkConfigService.update(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ARK_CONFIG_KEY });
      toast.success('Settings saved');
    },
    onError: error => {
      toast.error('Failed to save settings', {
        description: getErrorMessage(error),
      });
    },
  });
};

export const useClearArkConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => arkConfigService.clear(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ARK_CONFIG_KEY });
      toast.success('Defaults cleared');
    },
    onError: error => {
      toast.error('Failed to clear defaults', {
        description: getErrorMessage(error),
      });
    },
  });
};
