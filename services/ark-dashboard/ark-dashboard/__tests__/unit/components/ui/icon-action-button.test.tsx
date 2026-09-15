import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconActionButton } from '@/components/ui/icon-action-button';

describe('IconActionButton', () => {
  it('renders a button with the label as its accessible name', () => {
    render(
      <IconActionButton label="Delete agent" onClick={vi.fn()}>
        <span>icon</span>
      </IconActionButton>,
    );

    expect(
      screen.getByRole('button', { name: 'Delete agent' }),
    ).toBeInTheDocument();
  });

  it('calls onClick when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconActionButton label="Delete agent" onClick={onClick}>
        <span>icon</span>
      </IconActionButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete agent' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows a tooltip on hover, defaulting to the label', async () => {
    const user = userEvent.setup();
    render(
      <IconActionButton label="Delete agent" onClick={vi.fn()}>
        <span>icon</span>
      </IconActionButton>,
    );

    await user.hover(screen.getByRole('button', { name: 'Delete agent' }));
    await waitFor(() => {
      expect(screen.getAllByText('Delete agent').length).toBeGreaterThan(0);
    });
  });

  it('shows the tooltip override text when provided', async () => {
    const user = userEvent.setup();
    render(
      <IconActionButton
        label="Delete tool"
        tooltip="Tool is used by agents"
        onClick={vi.fn()}>
        <span>icon</span>
      </IconActionButton>,
    );

    await user.hover(screen.getByRole('button', { name: 'Delete tool' }));
    await waitFor(() => {
      expect(
        screen.getAllByText('Tool is used by agents').length,
      ).toBeGreaterThan(0);
    });
  });

  it('disables the button when disabled is set', () => {
    render(
      <IconActionButton label="Delete agent" disabled onClick={vi.fn()}>
        <span>icon</span>
      </IconActionButton>,
    );

    expect(screen.getByRole('button', { name: 'Delete agent' })).toBeDisabled();
  });
});
