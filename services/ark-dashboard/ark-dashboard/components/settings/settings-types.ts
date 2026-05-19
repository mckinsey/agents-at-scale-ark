import { Search, Zap } from 'lucide-react';

export type SettingPage = 'queries' | 'experimental-features';

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
    ],
  },
];
