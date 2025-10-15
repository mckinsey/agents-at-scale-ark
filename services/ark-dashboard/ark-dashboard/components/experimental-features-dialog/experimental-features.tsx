import { isExperimentalFeaturesEnabledAtom, storedIsExperimentalDarkModeEnabledAtom } from "@/atoms/experimental-features";
import { ExperimentalFeatureGroup } from "./types";

export const experimentalFeatureGroups: ExperimentalFeatureGroup[] = [
  {
    groupKey: 'system',
    features: [
      {
        feature: 'Experimental Features',
        description: 'Turning this off will disable experimental features',
        atom: isExperimentalFeaturesEnabledAtom
      }
    ]
  },
  {
    groupKey: 'ui-ux',
    groupLabel: 'UI/UX',
    features: [
      {
        feature: 'Experimental Dark Mode',
        description: 'Enables experimental Dark Mode',
        atom: storedIsExperimentalDarkModeEnabledAtom
      }
    ]
  }
]