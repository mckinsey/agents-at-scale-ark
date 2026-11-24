import { CreateModelForm } from '@/components/forms';

type SearchParams = {
  name?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function CreateModelPage({ searchParams }: Props) {
  const params = await searchParams;

  return <CreateModelForm defaultName={params.name} />;
}
