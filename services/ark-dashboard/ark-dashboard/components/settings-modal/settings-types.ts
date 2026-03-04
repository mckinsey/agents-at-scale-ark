import { Database, Key, Lock, Server, Store, Zap } from 'lucide-react';

import type { SettingPage } from '@/atoms/settings-modal';

export type SettingMenuItem = {
  key: SettingPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type SettingsSection = {
  sectionKey: string;
  sectionLabel: string;
  items: SettingMenuItem[];
};

export const settingsSections: SettingsSection[] = [
  {
    sectionKey: 'general',
    sectionLabel: 'General',
    items: [
      {
        key: 'a2a-servers',
        label: 'A2A Servers',
        icon: Server,
      },
      {
        key: 'ark-services',
        label: 'Ark Services',
        icon: Server,
      },
      {
        key: 'memory',
        label: 'Memory',
        icon: Database,
      },
      {
        key: 'manage-marketplace',
        label: 'Manage marketplace',
        icon: Store,
      },
      {
        key: 'experimental-features',
        label: 'Experimental Features',
        icon: Zap,
      },
    ],
  },
  {
    sectionKey: 'privacy',
    sectionLabel: 'Privacy',
    items: [
      {
        key: 'service-api-keys',
        label: 'Service API Keys',
        icon: Key,
      },
      {
        key: 'secrets',
        label: 'Secrets',
        icon: Lock,
      },
    ],
  },
];
