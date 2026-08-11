import { fireEvent, render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { storedQueryTimeoutSettingAtom } from '@/atoms/experimental-features';
import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';
import { ExperimentalFeaturesSettings } from '@/components/settings/experimental-features-settings';

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

  it('updates the query timeout atom when a valid number is entered', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <ExperimentalFeaturesSettings />
      </Provider>,
    );

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '7' },
    });

    expect(store.get(storedQueryTimeoutSettingAtom)).toBe('7m');
  });

  it('ignores a non-positive query timeout value', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <ExperimentalFeaturesSettings />
      </Provider>,
    );

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '0' },
    });

    expect(store.get(storedQueryTimeoutSettingAtom)).not.toBe('0m');
  });
});
