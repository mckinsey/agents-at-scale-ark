import { useEffect, useState } from 'react';

import { type ArkService, arkServicesService } from '@/lib/services';

export interface UseArkServicesResult {
  services: ArkService[];
  loading: boolean;
  error: string | null;
}

export function useArkServices(): UseArkServicesResult {
  const [services, setServices] = useState<ArkService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await arkServicesService.getAll();
        setServices(data.items);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load ARK services',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  return { services, loading, error };
}
