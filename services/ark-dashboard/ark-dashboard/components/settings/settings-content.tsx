'use client';

import { Suspense, useMemo } from 'react';

import type { SettingPage } from './settings-types';

import { ExperimentalFeaturesSettings } from './experimental-features-settings';
import { QueriesSettings } from './queries-settings';

type SettingsContentProps = {
  activePage: SettingPage;
};

type PageConfig = {
  title: string;
  component: React.ReactNode;
};

export function SettingsContent({ activePage }: SettingsContentProps) {
  const pageConfigs: Record<SettingPage, PageConfig> = useMemo(
    () => ({
      queries: {
        title: 'Queries',
        component: <QueriesSettings />,
      },
      'experimental-features': {
        title: 'Experimental features',
        component: <ExperimentalFeaturesSettings />,
      },
    }),
    [],
  );

  const config = pageConfigs[activePage];

  return (
    <div className="bg-sidebar flex flex-1 flex-col overflow-hidden">
      <div className="px-8 py-8">
        <h1 className="text-md text-sidebar-foreground font-semibold">
          {config.title}
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Suspense
          fallback={
            <div className="flex h-32 items-center justify-center">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          }>
          {config.component}
        </Suspense>
      </div>
    </div>
  );
}
