import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import type { ModelUpdateRequest } from './models';
import { modelsService } from './models';

export const GET_ALL_MODELS_QUERY_KEY = 'get-all-models';
export const GET_MODEL_BY_ID_QUERY_KEY = 'get-model-by-id';

export const useGetAllModels = () => {
  return useQuery({
    queryKey: [GET_ALL_MODELS_QUERY_KEY],
    queryFn: modelsService.getAll,
  });
};

type UseCreateModelProps = {
  onSuccess?: () => void;
};

export const useCreateModel = (props?: UseCreateModelProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: modelsService.create,
    onSuccess: model => {
      toast.success('Model Created', {
        description: `Successfully created ${model.name}`,
      });

      queryClient.invalidateQueries({ queryKey: [GET_ALL_MODELS_QUERY_KEY] });

      if (props?.onSuccess) {
        props.onSuccess();
      }
    },
    onError: (error, data) => {
      const getMessage = () => {
        if (error instanceof Error) {
          return error.message;
        }
        return 'An unexpected error occurred';
      };

      toast.error(`Failed to create Model: ${data.name}`, {
        description: getMessage(),
      });
    },
  });
};

type UseGetModelbyIdProps = {
  modelId: string | number;
};

export const useGetModelbyId = ({ modelId }: UseGetModelbyIdProps) => {
  const query = useQuery({
    queryKey: [GET_MODEL_BY_ID_QUERY_KEY, modelId],
    queryFn: () => modelsService.getById(modelId),
  });

  useEffect(() => {
    if (query.error) {
      toast.error(`Failed to get Model: ${modelId}`, {
        description:
          query.error instanceof Error
            ? query.error.message
            : 'An unexpected error occurred',
      });
    }
  }, [query.error, modelId]);

  return query;
};

export const useUpdateModelById = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: ModelUpdateRequest & { id: string }) => {
      return modelsService.updateById(id, data);
    },
    onSuccess: model => {
      toast.success('Model Updated', {
        description: `Successfully updated ${model?.id}`,
      });

      queryClient.invalidateQueries({ queryKey: [GET_ALL_MODELS_QUERY_KEY] });
      if (model?.id) {
        queryClient.invalidateQueries({
          queryKey: [GET_MODEL_BY_ID_QUERY_KEY, model.id],
        });
      }
    },
    onError: (error, data) => {
      const getMessage = () => {
        if (error instanceof Error) {
          return error.message;
        }
        return 'An unexpected error occurred';
      };

      toast.error(`Failed to update Model: ${data.id}`, {
        description: getMessage(),
      });
    },
  });
};
