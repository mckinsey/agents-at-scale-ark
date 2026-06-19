'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { SettingsContent } from '@/components/settings/settings-content';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import { type SettingPage, settingsSections } from '@/components/settings/settings-types';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

const DEFAULT_SETTINGS_PAGE: SettingPage = 'a2a-servers';

const VALID_SETTINGS_PAGES: SettingPage[] = settingsSections.flatMap(s =>
  s.items.map(i => i.key),
);

export default function SettingsPage() {
  const params = useParams();
  const { replace } = useNamespacedNavigation();

  const pageSegments = params.page as string[] | undefined;
  const pageKey = pageSegments?.[0] as SettingPage | undefined;
  const isValidPage = pageKey != null && VALID_SETTINGS_PAGES.includes(pageKey);

  const activePage = isValidPage ? pageKey : DEFAULT_SETTINGS_PAGE;

  useEffect(() => {
    if (!isValidPage) {
      replace(`/settings/${DEFAULT_SETTINGS_PAGE}`);
    }
  }, [isValidPage, replace]);

  return (
    <div className="bg-sidebar flex h-full w-full overflow-hidden">
      <SettingsSidebar activePage={activePage} />
      <SettingsContent activePage={activePage} />
    </div>
  );
}
