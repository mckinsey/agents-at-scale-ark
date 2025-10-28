import type { atomWithStorage } from 'jotai/utils';
import type { ReactNode } from 'react';

export type ExperimentalFeature = {
  feature: string;
  description?: ReactNode;
  atom: ReturnType<typeof atomWithStorage<boolean>>;
};

export type ExperimentalFeatureGroup = {
  groupKey: string;
  groupLabel?: string;
  features: ExperimentalFeature[];
};
