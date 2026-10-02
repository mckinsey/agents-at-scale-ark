export type SettingPage =
  | 'queries'
  | 'experimental-features'
  | 'execution-engines'
  | 'manage-marketplace';

export type ExperimentalSettingPage =
  | 'execution-engines'
  | 'manage-marketplace';

type SettingMenuItemBase = {
  label: string;
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
        label: 'Queries settings',
      },
      {
        key: 'experimental-features',
        label: 'Experimental features',
      },
      {
        key: 'execution-engines',
        label: 'Execution engines',
        experimental: true,
      },
      {
        key: 'manage-marketplace',
        label: 'Manage marketplace',
        experimental: true,
      },
    ],
  },
];
