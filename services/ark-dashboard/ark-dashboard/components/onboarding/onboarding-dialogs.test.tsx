import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PostTourDialog } from './post-tour-dialog';
import { WelcomeDialog } from './welcome-dialog';

interface DialogCase {
  name: string;
  title: string;
  confirmLabel: RegExp;
  dismissLabel: RegExp;
  render: (onConfirm: () => void, onDismiss: () => void) => ReactElement;
}

const CASES: DialogCase[] = [
  {
    name: 'WelcomeDialog',
    title: 'Welcome to Ark',
    confirmLabel: /Start Guided Tour/i,
    dismissLabel: /Skip for now/i,
    render: (onConfirm, onDismiss) => (
      <WelcomeDialog open onStart={onConfirm} onSkip={onDismiss} />
    ),
  },
  {
    name: 'PostTourDialog',
    title: 'Tour complete',
    confirmLabel: /Create my first agent/i,
    dismissLabel: /Maybe later/i,
    render: (onConfirm, onDismiss) => (
      <PostTourDialog open onCreateAgent={onConfirm} onDismiss={onDismiss} />
    ),
  },
];

function setup(dialog: DialogCase) {
  const onConfirm = vi.fn();
  const onDismiss = vi.fn();
  render(dialog.render(onConfirm, onDismiss));
  return { onConfirm, onDismiss };
}

describe.each(CASES)('$name', dialog => {
  it('renders the title', () => {
    setup(dialog);
    expect(screen.getByText(dialog.title)).toBeInTheDocument();
  });

  it('confirms from the primary button', () => {
    const { onConfirm, onDismiss } = setup(dialog);
    fireEvent.click(screen.getByRole('button', { name: dialog.confirmLabel }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses from the secondary button', () => {
    const { onConfirm, onDismiss } = setup(dialog);
    fireEvent.click(screen.getByRole('button', { name: dialog.dismissLabel }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismisses when closed with Escape', () => {
    const { onDismiss } = setup(dialog);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('dismisses when closed with the close button', () => {
    const { onDismiss } = setup(dialog);
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
