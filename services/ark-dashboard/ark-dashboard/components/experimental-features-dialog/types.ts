import type { atomWithStorage } from 'jotai/utils';
import type { ReactNode } from 'react';

export type BooleanSetting = {
  type: 'boolean';
  feature: string;
  description?: ReactNode;
  atom: ReturnType<typeof atomWithStorage<boolean>>;
};

export type NumberSetting = {
  type: 'number';
  feature: string;
  description?: ReactNode;
  atom: ReturnType<typeof atomWithStorage<string>>;
};

export type ExperimentalFeature = BooleanSetting | NumberSetting;

export type ExperimentalFeatureGroup = {
  groupKey: string;
  groupLabel?: string;
  features: ExperimentalFeature[];
};
