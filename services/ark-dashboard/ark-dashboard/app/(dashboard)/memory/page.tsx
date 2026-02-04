import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { MemorySection } from '@/components/sections';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function MemoryPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Memory" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">Memory</h1>
        </div>
        <MemorySection />
      </div>
    </>
  );
}
