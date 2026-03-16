import {
  type BreadcrumbElement,
  PageHeader,
} from '@/components/common/page-header';
import { CreateModelForm } from '@/components/forms';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

type SearchParams = {
  name?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function CreateModelPage({ searchParams }: Props) {
  const params = await searchParams;

  const breadcrumbs: BreadcrumbElement[] = [
    ...BASE_BREADCRUMBS,
    { label: 'Models', href: '/models' },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader breadcrumbs={breadcrumbs} currentPage="New Model" />
      <main className="container px-6 py-8">
        <CreateModelForm defaultName={params.name} />
      </main>
    </div>
  );
}
