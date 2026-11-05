import { useQuery } from '@tanstack/react-query';

import { retryQueryHandler } from '@/lib/utils/query-retry';
import { useNamespace } from '@/providers/NamespaceProvider';

import { arkServicesService } from './ark-services';

export const GET_ALL_ARK_SERVICES_QUERY_KEY = 'get-all-ark-services';

export const useGetAllArkServices = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_ARK_SERVICES_QUERY_KEY, namespace],
    queryFn: () => arkServicesService.getAll(namespace),
    enabled: Boolean(namespace),
    retry: retryQueryHandler,
  });
};
