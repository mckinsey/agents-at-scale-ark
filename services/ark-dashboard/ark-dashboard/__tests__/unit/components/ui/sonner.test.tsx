import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Toaster, toast } from '@/components/ui/sonner';

describe('toast', () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
  });

  it('shows the description under the message', async () => {
    render(<Toaster />);
    act(() => {
      toast.error('Failed to create Model: gpt', {
        description: 'The API key secret does not exist.',
      });
    });

    expect(
      await screen.findByText('Failed to create Model: gpt'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The API key secret does not exist.'),
    ).toBeInTheDocument();
  });

  it('shows a description given as a function', async () => {
    render(<Toaster />);
    act(() => {
      toast.success('Saved', { description: () => 'All changes stored.' });
    });

    expect(await screen.findByText('All changes stored.')).toBeInTheDocument();
  });

  it('renders only the message when there is no description', async () => {
    render(<Toaster />);
    act(() => {
      toast.info('Nothing else to say');
    });

    const message = await screen.findByText('Nothing else to say');
    expect(message.parentElement?.querySelectorAll('p')).toHaveLength(1);
  });
});
