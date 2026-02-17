import { PageHeader } from '@/components/common/page-header';
import { MemorySection } from '@/components/sections';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function MemoryPage() {
  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Memory" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-xl">Memory</h1>
        </div>
        <MemorySection />
      </div>
    </>
  );
}
