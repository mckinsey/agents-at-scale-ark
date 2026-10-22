import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArgoServerUrlMissingAlert } from '@/components/alerts/argo-server-url-missing-alert';
import type { SystemInfo } from '@/lib/services/system-info';

const systemInfo = vi.hoisted(() => ({
  value: undefined as SystemInfo | undefined,
}));

vi.mock('@/lib/services/system-info-hooks', () => ({
  useGetSystemInfo: () => ({ data: systemInfo.value }),
}));

const ALERT_TEST_ID = 'argo-server-url-missing-alert';

describe('ArgoServerUrlMissingAlert', () => {
  beforeEach(() => {
    systemInfo.value = undefined;
  });

  it('shows the warning when ark-api reports ARGO_SERVER_URL is not set', () => {
    systemInfo.value = {
      kubernetes_version: 'v1.31.2',
      system_version: 'v0.1.72',
      argo_server_configured: false,
    };

    render(<ArgoServerUrlMissingAlert />);

    expect(screen.getByTestId(ALERT_TEST_ID)).toBeInTheDocument();
    expect(
      screen.getByText('Workflow runs are not sorted by start time'),
    ).toBeInTheDocument();
    expect(screen.getByText(/ARGO_SERVER_URL is not set/)).toBeInTheDocument();
  });

  it('renders nothing when ARGO_SERVER_URL is set', () => {
    systemInfo.value = {
      kubernetes_version: 'v1.31.2',
      system_version: 'v0.1.72',
      argo_server_configured: true,
    };

    render(<ArgoServerUrlMissingAlert />);

    expect(screen.queryByTestId(ALERT_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders nothing while system info is loading or unavailable', () => {
    render(<ArgoServerUrlMissingAlert />);

    expect(screen.queryByTestId(ALERT_TEST_ID)).not.toBeInTheDocument();
  });
});
