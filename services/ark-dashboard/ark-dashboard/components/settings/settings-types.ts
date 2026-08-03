import { Cog, Search, Store, Zap } from 'lucide-react';

export type SettingPage =
  | 'queries'
  | 'experimental-features'
  | 'execution-engines'
  | 'manage-marketplace';

export type ExperimentalSettingPage = 'execution-engines' | 'manage-marketplace';

type SettingMenuItemBase = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type SettingMenuItem =
  | (SettingMenuItemBase & {
      key: Exclude<SettingPage, ExperimentalSettingPage>;
      experimental?: never;
    })
  | (SettingMenuItemBase & {
      key: ExperimentalSettingPage;
      experimental: true;
    });

export type SettingsSection = {
  sectionKey: string;
  sectionLabel: string;
  items: SettingMenuItem[];
};

export const settingsSections: SettingsSection[] = [
  {
    sectionKey: 'settings',
    sectionLabel: '',
    items: [
      {
        key: 'queries',
        label: 'Queries',
        icon: Search,
      },
      {
        key: 'experimental-features',
        label: 'Experimental features',
        icon: Zap,
      },
      {
        key: 'execution-engines',
        label: 'Execution Engines',
        icon: Cog,
        experimental: true,
      },
      {
        key: 'manage-marketplace',
        label: 'Manage marketplace',
        icon: Store,
        experimental: true,
      },
    ],
  },
];
