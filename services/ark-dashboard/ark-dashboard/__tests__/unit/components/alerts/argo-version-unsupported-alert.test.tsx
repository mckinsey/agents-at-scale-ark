import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArgoVersionUnsupportedAlert } from '@/components/alerts/argo-version-unsupported-alert';
import { useGetSystemInfo } from '@/lib/services/system-info-hooks';

vi.mock('@/lib/services/system-info-hooks', () => ({
  useGetSystemInfo: vi.fn(),
}));

const mockUseGetSystemInfo = vi.mocked(useGetSystemInfo);

function mockSystemInfo(data: unknown) {
  mockUseGetSystemInfo.mockReturnValue({
    data,
  } as ReturnType<typeof useGetSystemInfo>);
}

describe('ArgoVersionUnsupportedAlert', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the warning when the Argo Server version is unsupported', () => {
    mockSystemInfo({ argo_server_version_supported: false });

    render(<ArgoVersionUnsupportedAlert />);

    expect(
      screen.getByTestId('argo-version-unsupported-alert'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Argo Workflows version is not supported'),
    ).toBeInTheDocument();
  });

  it('renders nothing when the Argo Server version is supported', () => {
    mockSystemInfo({ argo_server_version_supported: true });

    const { container } = render(<ArgoVersionUnsupportedAlert />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while system info is loading', () => {
    mockSystemInfo(undefined);

    const { container } = render(<ArgoVersionUnsupportedAlert />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing against an ark-api that does not report the field', () => {
    mockSystemInfo({ kubernetes_version: 'v1.31.2', system_version: 'v0.1.68' });

    const { container } = render(<ArgoVersionUnsupportedAlert />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a dismiss control', () => {
    mockSystemInfo({ argo_server_version_supported: false });

    render(<ArgoVersionUnsupportedAlert />);

    expect(
      screen.getByTestId('argo-version-unsupported-alert-dismiss'),
    ).toBeInTheDocument();
  });

  it('hides and stays hidden after the dismiss control is clicked', async () => {
    mockSystemInfo({ argo_server_version_supported: false });

    const { unmount } = render(<ArgoVersionUnsupportedAlert />);
    await waitFor(() =>
      expect(
        screen.getByTestId('argo-version-unsupported-alert'),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByTestId('argo-version-unsupported-alert-dismiss'),
    );

    expect(
      screen.queryByTestId('argo-version-unsupported-alert'),
    ).not.toBeInTheDocument();

    unmount();
    render(<ArgoVersionUnsupportedAlert />);

    await waitFor(() =>
      expect(
        screen.queryByTestId('argo-version-unsupported-alert'),
      ).not.toBeInTheDocument(),
    );
  });
});
