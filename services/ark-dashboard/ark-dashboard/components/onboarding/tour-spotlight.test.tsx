import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TourStep } from '@/lib/constants/tour-steps';
import { TourSpotlight } from './tour-spotlight';

const STEPS: TourStep[] = [
  {
    targetId: 'nav-alpha',
    title: 'Alpha step',
    message: 'Alpha message',
    action: 'Do alpha',
    actionHref: '/alpha',
  },
  { targetId: 'nav-beta', title: 'Beta step', message: 'Beta message' },
];

function setup(activeStep: number, withTarget: boolean) {
  const handlers = {
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    onAction: vi.fn(),
  };
  render(
    <>
      {withTarget && <div data-onboarding-id={STEPS[activeStep].targetId} />}
      <TourSpotlight steps={STEPS} activeStep={activeStep} {...handlers} />
    </>,
  );
  return handlers;
}

describe('TourSpotlight', () => {
  it('renders the active step with skip and next controls', () => {
    const handlers = setup(0, true);
    expect(screen.getByText('Alpha step')).toBeInTheDocument();
    expect(screen.getByText('Alpha message')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    expect(handlers.onSkip).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(handlers.onNext).toHaveBeenCalled();
  });

  it('fires the action callback and hides Back on the first step', () => {
    const handlers = setup(0, true);
    expect(
      screen.queryByRole('button', { name: /^Back$/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Do alpha/i }));
    expect(handlers.onAction).toHaveBeenCalledWith('/alpha');
  });

  it('shows Back and Finish Tour on the last step', () => {
    const handlers = setup(1, true);
    expect(
      screen.getByRole('button', { name: /Finish Tour/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(handlers.onPrev).toHaveBeenCalled();
  });

  it('still renders the card with controls when the target is missing', () => {
    const handlers = setup(0, false);
    expect(screen.getByText('Alpha step')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(handlers.onNext).toHaveBeenCalled();
  });
});
