'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { ModelsSection } from '@/components/sections/models-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function ModelsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Models"
        actions={
          <Link href="/models/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          </Link>
        }
      />
      <div className="flex flex-1 flex-col">
        <ModelsSection namespace={namespace} />
      </div>
    </>
  );
}
