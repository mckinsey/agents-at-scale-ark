import { PageHeader } from '@/components/common/page-header';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { MemorySection } from '@/components/sections';

export default function MemoryPage() {
  const breadcrumbs: BreadcrumbElement[] = [
    { href: '/', label: 'ARK Dashboard' },
  ];

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Memory" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-xl">Memory</h1>
        </div>
        <MemorySection />
      </div>
    </>
  );
}
