'use client';

import { useParams } from 'next/navigation';

import { TeamForm, TeamFormMode } from '@/components/forms/team-form';

export default function TeamViewPage() {
  const params = useParams();
  const teamName = decodeURIComponent(params.name as string);

  return <TeamForm mode={TeamFormMode.VIEW} teamName={teamName} />;
}
