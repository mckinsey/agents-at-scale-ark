'use client';

import { ArkServicesTable } from '@/components/ark-services/ark-services-table';
import { useArkServices } from '@/components/ark-services/use-ark-services';

export function ArkServicesSettings() {
  const { services, loading, error } = useArkServices();

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-muted-foreground">Loading services...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
        <p className="font-medium">Error loading ARK services</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return <ArkServicesTable data={services} />;
}
