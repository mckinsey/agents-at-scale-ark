import { useQuery } from '@tanstack/react-query';

import { retryQueryHandler } from '@/lib/utils/query-retry';
import { useNamespace } from '@/providers/NamespaceProvider';

import { arkServicesService } from './ark-services';

export const HELM_RELEASES_QUERY_KEY = 'helm-releases';

export const useHelmReleases = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [HELM_RELEASES_QUERY_KEY, namespace],
    queryFn: () => arkServicesService.getAll(namespace),
    enabled: Boolean(namespace),
    retry: retryQueryHandler,
  });
};
