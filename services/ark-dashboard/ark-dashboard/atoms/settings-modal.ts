import { atom } from 'jotai';

export const settingsModalOpenAtom = atom<boolean>(false);

export type SettingPage =
  | 'a2a-servers'
  | 'memory'
  | 'manage-marketplace'
  | 'service-api-keys'
  | 'secrets'
  | 'experimental-features';

export const activeSettingPageAtom = atom<SettingPage>('a2a-servers');
