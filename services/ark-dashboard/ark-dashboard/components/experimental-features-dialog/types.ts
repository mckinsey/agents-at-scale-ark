import type { atomWithStorage } from 'jotai/utils';
import type { ReactNode } from 'react';

export type BooleanSetting = {
  type: 'boolean';
  feature: string;
  description?: ReactNode;
  atom: ReturnType<typeof atomWithStorage<boolean>>;
};

export type SelectSetting = {
  type: 'select';
  feature: string;
  description?: ReactNode;
  atom: ReturnType<typeof atomWithStorage<string>>;
  options: Array<{ value: string; label: string }>;
};

export type ExperimentalFeature = BooleanSetting | SelectSetting;

export type ExperimentalFeatureGroup = {
  groupKey: string;
  groupLabel?: string;
  features: ExperimentalFeature[];
};
