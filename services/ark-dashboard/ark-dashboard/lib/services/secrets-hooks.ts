import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { secretsService } from "./secrets";
import { toast } from "@/components/ui/use-toast";
import { APIError } from "@/lib/api/client";

export const GET_ALL_SECRETS_QUERY_KEY = "get-all-secrets";

export const useGetAllSecrets = () => {
  return useQuery({
    queryKey: [GET_ALL_SECRETS_QUERY_KEY],
    queryFn: secretsService.getAll
  });
};

type useCreateSecretProps = {
  onSuccess?: () => void
}

export const useCreateSecret = (props: useCreateSecretProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, password }: { name: string, password: string }) => {
      return secretsService.create(name, password)
    },
    onSuccess: (_, data) => {
      toast({
        variant: "success",
        title: "Secret Created",
        description: `Successfully created secret ${data.name}`
      })

      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] })

      if (props.onSuccess) {
        props.onSuccess()
      }
    },
    onError: (error, data) => {
      const getMessage = () => {
        if (error instanceof APIError && error.status === 409) {
          return `A Secret with the name "${data.name}" already exists.`
        }
        if (error instanceof Error) {
          return error.message
        }
        return "An unexpected error occurred"
      }

      toast({
        variant: "destructive",
        title: `Failed to create Secret: ${data.name}`,
        description: getMessage()
      })
    }
  })
}