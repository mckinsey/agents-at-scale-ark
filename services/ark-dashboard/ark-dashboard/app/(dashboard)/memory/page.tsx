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
        <MemorySection />
      </div>
    </>
  );
}
