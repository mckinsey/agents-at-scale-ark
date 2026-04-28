'use client';

import { PageHeader } from '@/components/common/page-header';
import { SkillEditor } from '@/components/editors/skill-editor';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

const SKILL_BREADCRUMBS = [
  ...BASE_BREADCRUMBS,
  { label: 'Skills', href: '/skills' },
];

export default function NewSkillPage() {
  return (
    <>
      <PageHeader breadcrumbs={SKILL_BREADCRUMBS} currentPage="New skill" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">New skill</h1>
        </div>
        <SkillEditor mode="create" />
      </div>
    </>
  );
}
