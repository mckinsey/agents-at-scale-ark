import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from '@/components/ui/sonner';

import { useNamespace } from '@/providers/NamespaceProvider';

import type { ModelCreateRequest, ModelUpdateRequest } from './models';
import { modelsService } from './models';

export const GET_ALL_MODELS_QUERY_KEY = 'get-all-models';
export const GET_MODEL_BY_ID_QUERY_KEY = 'get-model-by-id';

export const useGetAllModels = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_MODELS_QUERY_KEY, namespace],
    queryFn: () => modelsService.getAll(namespace),
    enabled: Boolean(namespace),
  });
};

type UseCreateModelProps = {
  onSuccess?: () => void;
};

export const useCreateModel = (props?: UseCreateModelProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: (model: ModelCreateRequest) =>
      modelsService.create(namespace, model),
    onSuccess: () => {
      toast.success('Model created successfully');

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
  const { namespace } = useNamespace();

  const query = useQuery({
    queryKey: [GET_MODEL_BY_ID_QUERY_KEY, modelId, namespace],
    queryFn: () => modelsService.getById(namespace, modelId),
    enabled: Boolean(namespace),
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
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: ({ id, ...data }: ModelUpdateRequest & { id: string }) => {
      return modelsService.updateById(namespace, id, data);
    },
    onSuccess: model => {
      toast.success('Model updated successfully');

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
