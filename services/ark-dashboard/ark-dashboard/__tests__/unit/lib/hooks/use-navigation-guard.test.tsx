import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const routerPushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: routerPushMock, replace: vi.fn() })),
}));

import {
  NavigationGuardProvider,
  useNavigationGuardContext,
  useUnsavedChangesGuard,
} from '@/lib/hooks/use-navigation-guard';

const navSpy = vi.fn();

function Harness({ isDirty }: { isDirty: boolean }) {
  const { requestNavigation, navigateHref } = useNavigationGuardContext();
  const { bypass } = useUnsavedChangesGuard(isDirty);

  const navigate = () => {
    const doNav = () => navSpy();
    if (!requestNavigation(doNav)) {
      doNav();
    }
  };

  const linkNavigate = () => {
    if (!requestNavigation(() => navigateHref('/target'))) {
      navigateHref('/target');
    }
  };

  return (
    <div>
      <button onClick={navigate}>nav</button>
      <button onClick={linkNavigate}>link-nav</button>
      <button onClick={() => bypass(navigate)}>bypass</button>
    </div>
  );
}

function renderHarness(isDirty: boolean) {
  navSpy.mockClear();
  routerPushMock.mockClear();
  return render(
    <NavigationGuardProvider>
      <Harness isDirty={isDirty} />
    </NavigationGuardProvider>,
  );
}

describe('useUnsavedChangesGuard', () => {
  it('navigates immediately when not dirty', () => {
    renderHarness(false);

    fireEvent.click(screen.getByText('nav'));

    expect(navSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('Discard unsaved changes?'),
    ).not.toBeInTheDocument();
  });

  it('intercepts navigation and confirms when dirty', async () => {
    renderHarness(true);

    fireEvent.click(screen.getByText('nav'));

    expect(navSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Discard unsaved changes?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Discard changes'));

    expect(navSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByText('Discard unsaved changes?'),
      ).not.toBeInTheDocument(),
    );
  });

  it('cancels navigation when dirty and user keeps editing', async () => {
    renderHarness(true);

    fireEvent.click(screen.getByText('nav'));
    expect(
      await screen.findByText('Discard unsaved changes?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Keep editing'));

    expect(navSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByText('Discard unsaved changes?'),
      ).not.toBeInTheDocument(),
    );
  });

  it('routes a guarded link through the router on confirm', async () => {
    renderHarness(true);

    fireEvent.click(screen.getByText('link-nav'));
    expect(routerPushMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Discard unsaved changes?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Discard changes'));

    expect(routerPushMock).toHaveBeenCalledWith('/target');
  });

  it('bypass lets a navigation through without prompting', () => {
    renderHarness(true);

    fireEvent.click(screen.getByText('bypass'));

    expect(navSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('Discard unsaved changes?'),
    ).not.toBeInTheDocument();
  });
});

describe('useNavigationGuardContext without provider', () => {
  it('never intercepts navigation', () => {
    const spy = vi.fn();

    function StandaloneHarness() {
      const { requestNavigation } = useNavigationGuardContext();
      return (
        <button
          onClick={() => {
            const intercepted = requestNavigation(() => spy());
            if (!intercepted) {
              spy();
            }
          }}>
          nav
        </button>
      );
    }

    render(<StandaloneHarness />);
    fireEvent.click(screen.getByText('nav'));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
