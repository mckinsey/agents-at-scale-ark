import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TourStep } from '@/lib/constants/tour-steps';

import { READ_ONLY_HINT, TourSpotlight } from './tour-spotlight';

const STEPS: TourStep[] = [
  {
    targetId: 'nav-alpha',
    title: 'Alpha step',
    message: 'Alpha message',
    action: 'Do alpha',
    actionHref: '/alpha',
    resource: 'agents',
  },
  {
    targetId: 'nav-beta',
    title: 'Beta step',
    message: 'Beta message',
    action: 'See beta',
    actionHref: '/beta',
  },
];

function setup(activeStep: number, withTarget: boolean, readOnly = false) {
  const handlers = {
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    onAction: vi.fn(),
  };
  const view = render(
    <>
      {withTarget && <div data-onboarding-id={STEPS[activeStep].targetId} />}
      <TourSpotlight
        steps={STEPS}
        activeStep={activeStep}
        readOnly={readOnly}
        {...handlers}
      />
    </>,
  );
  return { handlers, ...view };
}

describe('TourSpotlight', () => {
  it('renders the active step with skip and next controls', () => {
    const { handlers } = setup(0, true);
    expect(screen.getByText('Alpha step')).toBeInTheDocument();
    expect(screen.getByText('Alpha message')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    expect(handlers.onSkip).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(handlers.onNext).toHaveBeenCalled();
  });

  it('fires the action callback and hides Back on the first step', () => {
    const { handlers } = setup(0, true);
    expect(
      screen.queryByRole('button', { name: /^Back$/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Do alpha/i }));
    expect(handlers.onAction).toHaveBeenCalledWith('/alpha');
  });

  it('disables a create action and explains why in read-only mode', () => {
    const { handlers } = setup(0, true, true);
    const action = screen.getByRole('button', { name: /Do alpha/i });
    expect(action).toBeDisabled();
    expect(screen.getByText(READ_ONLY_HINT)).toBeInTheDocument();

    fireEvent.click(action);
    expect(handlers.onAction).not.toHaveBeenCalled();
  });

  it('keeps navigation-only actions enabled in read-only mode', () => {
    const { handlers } = setup(1, true, true);
    expect(screen.queryByText(READ_ONLY_HINT)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /See beta/i }));
    expect(handlers.onAction).toHaveBeenCalledWith('/beta');
  });

  it('does not show the read-only hint when editing is allowed', () => {
    setup(0, true);
    expect(
      screen.getByRole('button', { name: /Do alpha/i }),
    ).not.toBeDisabled();
    expect(screen.queryByText(READ_ONLY_HINT)).not.toBeInTheDocument();
  });

  it('shows Back and Finish Tour on the last step', () => {
    const { handlers } = setup(1, true);
    expect(
      screen.getByRole('button', { name: /Finish Tour/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(handlers.onPrev).toHaveBeenCalled();
  });

  it('highlights the target when it is in the DOM', () => {
    const { container } = setup(0, true);
    expect(container.ownerDocument.querySelector('svg mask')).not.toBeNull();
  });

  it('still renders the card with controls when the target is missing', () => {
    const { handlers } = setup(0, false);
    expect(screen.getByText('Alpha step')).toBeInTheDocument();
    expect(document.querySelector('svg mask')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(handlers.onNext).toHaveBeenCalled();
  });

  it('picks up a target that mounts after the step is shown', async () => {
    setup(0, false);
    expect(document.querySelector('svg mask')).toBeNull();

    const lateTarget = document.createElement('div');
    lateTarget.dataset.onboardingId = 'nav-alpha';
    await act(async () => {
      document.body.appendChild(lateTarget);
      await Promise.resolve();
    });

    expect(document.querySelector('svg mask')).not.toBeNull();
    lateTarget.remove();
  });
});
