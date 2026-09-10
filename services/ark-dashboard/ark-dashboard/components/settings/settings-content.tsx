'use client';

import { Suspense, useMemo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { AddMarketplaceButton } from './add-marketplace-dialog';
import { ExecutionEnginesSettings } from './execution-engines-settings';
import { ExperimentalFeaturesSettings } from './experimental-features-settings';
import { ManageMarketplaceSettings } from './manage-marketplace-settings';
import { QueriesSettings } from './queries-settings';
import type { SettingPage } from './settings-types';

type SettingsContentProps = {
  activePage: SettingPage;
};

const SKELETON_ROWS = ['first', 'second', 'third', 'fourth'];

function SettingsPageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <Skeleton className="h-9 w-[280px]" />
      <div className="flex flex-col gap-4 pt-2">
        {SKELETON_ROWS.map(row => (
          <div key={row} className="flex items-center gap-4">
            <Skeleton className="h-5 w-[240px]" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-[140px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

type PageConfig = {
  title: string;
  component: React.ReactNode;
  action?: React.ReactNode;
};

export function SettingsContent({ activePage }: SettingsContentProps) {
  const pageConfigs: Record<SettingPage, PageConfig> = useMemo(
    () => ({
      queries: {
        title: 'Queries settings',
        component: <QueriesSettings />,
      },
      'experimental-features': {
        title: 'Experimental features',
        component: <ExperimentalFeaturesSettings />,
      },
      'execution-engines': {
        title: 'Execution engines',
        component: <ExecutionEnginesSettings />,
      },
      'manage-marketplace': {
        title: 'Manage marketplace',
        component: <ManageMarketplaceSettings />,
        action: <AddMarketplaceButton />,
      },
    }),
    [],
  );

  const config = pageConfigs[activePage];

  return (
    <div className="bg-sidebar flex flex-1 flex-col overflow-hidden">
      <div className="px-8 pt-10">
        <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-4">
          <h1 className="headings-h2-regular text-fg-primary">
            {config.title}
          </h1>
          {config.action}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 pt-5 pb-6">
        <div className="mx-auto w-full max-w-[1600px]">
          <Suspense fallback={<SettingsPageSkeleton />}>
            {config.component}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
