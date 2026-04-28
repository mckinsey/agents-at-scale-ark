'use client';

import { useParams } from 'next/navigation';

import { PageHeader } from '@/components/common/page-header';
import { SkillEditor } from '@/components/editors/skill-editor';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

const SKILL_BREADCRUMBS = [
  ...BASE_BREADCRUMBS,
  { label: 'Skills', href: '/skills' },
];

export default function EditSkillPage() {
  const params = useParams();
  const name =
    typeof params?.name === 'string'
      ? decodeURIComponent(params.name)
      : Array.isArray(params?.name)
        ? decodeURIComponent(params.name[0])
        : '';

  return (
    <>
      <PageHeader
        breadcrumbs={SKILL_BREADCRUMBS}
        currentPage={name || 'Edit skill'}
      />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">{name || 'Edit skill'}</h1>
        </div>
        <SkillEditor mode="edit" skillName={name} />
      </div>
    </>
  );
}
