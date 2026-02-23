'use client';

import { Suspense } from 'react';

import { ArkServicesTable } from '@/components/ark-services/ark-services-table';
import { useArkServices } from '@/components/ark-services/use-ark-services';
import { PageHeader } from '@/components/common/page-header';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

function ServicesContent() {
  const { services, loading, error } = useArkServices();

  if (loading) {
    return (
      <>
        <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Services" />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="flex h-32 items-center justify-center">
              <div className="text-muted-foreground">Loading services...</div>
            </div>
          </main>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Services" />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
              <p className="font-medium">Error loading ARK services</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Services" />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <h1 className="mb-4 px-2 text-3xl font-bold">ARK Services</h1>
          <ArkServicesTable data={services} />
        </main>
      </div>
    </>
  );
}

export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Loading...
        </div>
      }>
      <ServicesContent />
    </Suspense>
  );
}
