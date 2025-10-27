import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { type APIKeyCreateRequest, apiKeysService } from './api-keys';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
};

export const useListAPIKeys = () => {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysService.getAll(),
  });
};

export const useCreateAPIKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: APIKeyCreateRequest) =>
      apiKeysService.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: error => {
      console.error('Failed to create API key:', error);
      toast.error('Failed to create API key', {
        description: getErrorMessage(error),
      });
    },
  });
};

export const useDeleteAPIKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (publicKey: string) => apiKeysService.delete(publicKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: error => {
      console.error('Failed to delete API key:', error);
      toast.error('Failed to delete API key', {
        description: getErrorMessage(error),
      });
    },
  });
};
