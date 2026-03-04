'use client';

import { Suspense, useMemo } from 'react';

import type { SettingPage } from '@/atoms/settings-modal';
import { MemorySection } from '@/components/sections';
import { A2AServersSection } from '@/components/sections/a2a-servers-section';
import { SecretsSection } from '@/components/sections/secrets-section';
import { useNamespace } from '@/providers/NamespaceProvider';

import { ApiKeysSettings } from './api-keys-settings';
import { ArkServicesSettings } from './ark-services-settings';
import { ExperimentalFeaturesSettings } from './experimental-features-settings';
import { ManageMarketplaceSettings } from './manage-marketplace-settings';

type SettingsContentProps = {
  activePage: SettingPage;
};

type PageConfig = {
  title: string;
  component: React.ReactNode;
};

export function SettingsContent({ activePage }: SettingsContentProps) {
  const { namespace } = useNamespace();

  const pageConfigs: Record<SettingPage, PageConfig> = useMemo(
    () => ({
      'a2a-servers': {
        title: 'A2A Servers',
        component: <A2AServersSection namespace={namespace} />,
      },
      'ark-services': {
        title: 'Ark Services',
        component: <ArkServicesSettings />,
      },
      memory: {
        title: 'Memory',
        component: <MemorySection />,
      },
      'manage-marketplace': {
        title: 'Manage marketplace',
        component: <ManageMarketplaceSettings />,
      },
      'service-api-keys': {
        title: 'Service API Keys',
        component: <ApiKeysSettings />,
      },
      secrets: {
        title: 'Secrets',
        component: <SecretsSection namespace={namespace} />,
      },
      'experimental-features': {
        title: 'Experimental Features',
        component: <ExperimentalFeaturesSettings />,
      },
    }),
    [namespace],
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
