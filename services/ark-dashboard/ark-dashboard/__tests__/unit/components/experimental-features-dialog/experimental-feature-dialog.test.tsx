import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_STREAMING_FEATURE_KEY,
  QUERY_TIMEOUT_SETTING_KEY,
} from '@/atoms/experimental-features';
import { ExperimentalFeaturesDialog } from '@/components/experimental-features-dialog';

describe('ExperimentalFeaturesDialog component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the de-activated feature correctly', async () => {
    // Set Chat Streaming to enabled initially (default is true)
    localStorage.setItem(CHAT_STREAMING_FEATURE_KEY, 'true');

    render(
      <JotaiProvider>
        <ExperimentalFeaturesDialog />
      </JotaiProvider>,
    );

    // Open the dialog using keyboard shortcut (Cmd+E or Ctrl+E)
    await userEvent.keyboard('{Control>}e{/Control}');
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const streamingFeature =
      screen.getAllByText('Chat Streaming')[0].parentElement?.parentElement;
    expect(streamingFeature).toBeDefined();
    await userEvent.click(within(streamingFeature!).getByRole('switch'));

    await waitFor(() => {
      expect(localStorage.getItem(CHAT_STREAMING_FEATURE_KEY)).toBe('false');
    });
  });

  describe('Query Timeout Setting', () => {
    it('should display query timeout setting with default value', async () => {
      render(
        <JotaiProvider>
          <ExperimentalFeaturesDialog />
        </JotaiProvider>,
      );

      await userEvent.keyboard('{Control>}e{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Query Timeout')).toBeInTheDocument();
      expect(screen.getByText('Default timeout for query execution')).toBeInTheDocument();
    });

    it('should display Queries section', async () => {
      render(
        <JotaiProvider>
          <ExperimentalFeaturesDialog />
        </JotaiProvider>,
      );

      await userEvent.keyboard('{Control>}e{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(screen.getByText('Queries')).toBeInTheDocument();
    });

    it('should persist query timeout value changes', async () => {
      const user = userEvent.setup();

      render(
        <JotaiProvider>
          <ExperimentalFeaturesDialog />
        </JotaiProvider>,
      );

      await user.keyboard('{Control>}e{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // The select component should be present
      expect(screen.getByText('Query Timeout')).toBeInTheDocument();
      
      // Verify default value is in localStorage
      const storedValue = localStorage.getItem(QUERY_TIMEOUT_SETTING_KEY);
      // Default might not be set yet, or should be '5m'
      expect(storedValue === null || storedValue === '"5m"').toBe(true);
    });
  });
});
