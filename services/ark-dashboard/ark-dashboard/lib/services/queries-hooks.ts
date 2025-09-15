import { useQuery } from "@tanstack/react-query"
import { queriesService } from "./queries"

export const useListQueries = ( namespace: string) => {
  return useQuery({
    queryKey: ['list-all-queries', namespace],
    queryFn: () => queriesService.list(namespace),
    enabled: !!namespace
  })
}