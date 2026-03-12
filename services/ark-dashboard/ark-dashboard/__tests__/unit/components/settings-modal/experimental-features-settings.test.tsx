import { render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';
import { ExperimentalFeaturesSettings } from '@/components/settings-modal/experimental-features-settings';

describe('ExperimentalFeaturesSettings', () => {
  const renderWithStore = () => {
    const store = createStore();
    return render(
      <Provider store={store}>
        <ExperimentalFeaturesSettings />
      </Provider>,
    );
  };

  it('renders all group labels from experimentalFeatureGroups', () => {
    renderWithStore();

    for (const group of experimentalFeatureGroups) {
      if (group.groupLabel) {
        expect(screen.getByText(group.groupLabel)).toBeInTheDocument();
      }
    }
  });

  it('renders all feature names from experimentalFeatureGroups', () => {
    renderWithStore();

    for (const group of experimentalFeatureGroups) {
      for (const feature of group.features) {
        expect(screen.getAllByText(feature.feature).length).toBeGreaterThan(0);
      }
    }
  });
});
