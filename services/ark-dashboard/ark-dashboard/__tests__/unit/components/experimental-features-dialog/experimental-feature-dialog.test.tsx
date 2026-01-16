import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { CHAT_STREAMING_FEATURE_KEY } from '@/atoms/experimental-features';
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
});
