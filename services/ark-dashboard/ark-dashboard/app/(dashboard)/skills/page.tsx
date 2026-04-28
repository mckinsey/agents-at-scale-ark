'use client';

import { PageHeader } from '@/components/common/page-header';
import { SkillsSection } from '@/components/sections/skills-section';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function SkillsPage() {
  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Skills" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">Skills</h1>
        </div>
        <div className="flex-1 px-6 pb-6">
          <SkillsSection />
        </div>
      </div>
    </>
  );
}
