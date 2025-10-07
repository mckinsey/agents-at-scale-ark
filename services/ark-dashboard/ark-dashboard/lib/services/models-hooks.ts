import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelsService } from "./models";
import { toast } from "@/components/ui/use-toast";

export const GET_ALL_MODELS_QUERY_KEY = "get-all-models";

export const useGetAllModels = () => {
  return useQuery({
    queryKey: [GET_ALL_MODELS_QUERY_KEY],
    queryFn: modelsService.getAll
  });
};

type useCreateModelProps = {
  onSuccess?: () => void;
}

export const useCreateModel = (props?: useCreateModelProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: modelsService.create,
    onSuccess: (model) => {
      toast({
        variant: "success",
        title: "Model Created",
        description: `Successfully created ${model.name}`
      })

      queryClient.invalidateQueries({ queryKey: [GET_ALL_MODELS_QUERY_KEY] })

      if (props?.onSuccess) {
        props.onSuccess()
      }
    },
    onError: (error, data) => {
      const getMessage = () => {
        if (error instanceof Error) {
          return error.message
        }
        return "An unexpected error occurred"
      }

      toast({
        variant: "destructive",
        title: `Failed to create Model: ${data.name}`,
        description: getMessage()
      })
    }
  })
}