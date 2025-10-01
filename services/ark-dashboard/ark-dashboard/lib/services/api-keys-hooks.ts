import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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
      // Invalidate and refetch API keys list
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    }
  })
}

export const useDeleteAPIKey = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (publicKey: string) => apiKeysService.delete(publicKey),
    onSuccess: () => {
      // Invalidate and refetch API keys list
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    }
  })
}
