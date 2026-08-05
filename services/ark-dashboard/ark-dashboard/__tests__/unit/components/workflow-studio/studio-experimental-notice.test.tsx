import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioExperimentalNotice } from '@/components/workflow-studio/studio-experimental-notice';
import { useExperimentalNotice } from '@/components/workflow-studio/use-experimental-notice';
import { ARGO_WORKFLOWS_DOCS_URL } from '@/lib/constants/workflows';

function Harness() {
  const notice = useExperimentalNotice();
  return notice.visible ? (
    <StudioExperimentalNotice onDismiss={notice.dismiss} />
  ) : (
    <div data-testid="no-notice" />
  );
}

describe('StudioExperimentalNotice', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the experimental warning copy and dismiss control', () => {
    const onDismiss = vi.fn();
    render(<StudioExperimentalNotice onDismiss={onDismiss} />);

    const notice = screen.getByTestId('studio-experimental-notice');
    expect(notice).toHaveTextContent('Argo Make is experimental');
    expect(notice).toHaveTextContent('Use with caution');
    expect(
      screen.getByTestId('studio-experimental-notice-dismiss'),
    ).toBeInTheDocument();
  });

  it('links to the Argo Workflows and Argo Make docs', () => {
    render(<StudioExperimentalNotice onDismiss={vi.fn()} />);

    const workflowsLink = screen.getByTestId(
      'studio-experimental-notice-docs-workflows',
    );
    const argoMakeLink = screen.getByTestId(
      'studio-experimental-notice-docs-argo-make',
    );
    expect(workflowsLink).toHaveAttribute('href', ARGO_WORKFLOWS_DOCS_URL);
    expect(argoMakeLink).toHaveAttribute('href', ARGO_WORKFLOWS_DOCS_URL);
  });

  it('calls onDismiss when the dismiss control is clicked', () => {
    const onDismiss = vi.fn();
    render(<StudioExperimentalNotice onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('studio-experimental-notice-dismiss'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows on first use, then hides and stays hidden after dismissal', async () => {
    const { unmount } = render(<Harness />);

    await waitFor(() =>
      expect(
        screen.getByTestId('studio-experimental-notice'),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('studio-experimental-notice-dismiss'));

    expect(
      screen.queryByTestId('studio-experimental-notice'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('no-notice')).toBeInTheDocument();

    unmount();
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('no-notice')).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId('studio-experimental-notice'),
    ).not.toBeInTheDocument();
  });
});
