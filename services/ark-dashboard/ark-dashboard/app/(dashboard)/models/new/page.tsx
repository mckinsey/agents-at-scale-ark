import { PageHeader } from '@/components/common/page-header';
import { CreateModelForm } from '@/components/forms';

type SearchParams = {
  name?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function CreateModelPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="min-h-screen">
      <PageHeader />
      <main className="container px-6 py-8">
        <CreateModelForm defaultName={params.name} />
      </main>
    </div>
  );
}
