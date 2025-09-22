import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { namespacesService } from "./namespaces";
import { toast } from "@/components/ui/use-toast";

export const GET_CONTEXT_QUERY_KEY = "get-context"
export const GET_ALL_NAMESPACES_QUERY_KEY = "get-all-namespaces"

export const useGetContext = () => {
  return useQuery({
    queryKey: [GET_CONTEXT_QUERY_KEY],
    queryFn: namespacesService.getContext
  });
};

export const useGetAllNamespaces = () => {
  return useQuery({
    queryKey: [GET_ALL_NAMESPACES_QUERY_KEY],
    queryFn: namespacesService.getAll
  });
};

type useCreateNamespaceProps = {
  onSuccess?: (name: string) => void
}

export const useCreateNamespace = (props?: useCreateNamespaceProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: namespacesService.create,
    onSuccess: (_, name) => {
      toast({
        variant: "success",
        title: "Namespace Created",
        description: `Successfully created namespace ${name}`
      })

      queryClient.invalidateQueries({ queryKey: [GET_CONTEXT_QUERY_KEY] })

      if(props?.onSuccess) {
        props.onSuccess(name)
      }
    },
    onError: (error, name) => {
      toast({
          variant: "destructive",
          title: `Failed to create Namespace: ${name}`,
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
        })
    }
  })
}