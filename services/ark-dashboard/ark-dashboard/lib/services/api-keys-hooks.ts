import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/use-toast"
import { apiKeysService, type APIKeyCreateRequest } from "./api-keys"

export const useListAPIKeys = () => {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysService.getAll()
  })
}

export const useCreateAPIKey = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (request: APIKeyCreateRequest) => apiKeysService.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (error) => {
      console.error('Failed to create API key:', error)
      toast({
        title: "Error",
        description: "Failed to create API key. Please try again.",
        variant: "destructive"
      })
    }
  })
}

export const useDeleteAPIKey = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (publicKey: string) => apiKeysService.delete(publicKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (error) => {
      console.error('Failed to delete API key:', error)
      toast({
        title: "Error",
        description: "Failed to delete API key. Please try again.",
        variant: "destructive"
      })
    }
  })
}
