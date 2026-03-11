'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import type { SettingPage } from '@/atoms/settings-modal';
import { SettingsContent } from '@/components/settings-modal/settings-content';
import { SettingsSidebar } from '@/components/settings-modal/settings-sidebar';

const DEFAULT_SETTINGS_PAGE: SettingPage = 'a2a-servers';

const VALID_SETTINGS_PAGES: SettingPage[] = [
  'a2a-servers',
  'ark-services',
  'memory',
  'manage-marketplace',
  'service-api-keys',
  'secrets',
  'experimental-features',
];

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();

  const pageSegments = params.page as string[] | undefined;
  const pageKey = pageSegments?.[0] as SettingPage | undefined;

  const activePage =
    pageKey && VALID_SETTINGS_PAGES.includes(pageKey)
      ? pageKey
      : DEFAULT_SETTINGS_PAGE;

  useEffect(() => {
    if (!pageKey || !VALID_SETTINGS_PAGES.includes(pageKey)) {
      router.replace(`/settings/${DEFAULT_SETTINGS_PAGE}`);
    }
  }, [pageKey, router]);

  return (
    <div className="-m-10 flex h-[calc(100vh-1rem)] overflow-hidden">
      <SettingsSidebar activePage={activePage} />
      <SettingsContent activePage={activePage} />
    </div>
  );
}
