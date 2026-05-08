import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseNamespace = vi.fn();

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => mockUseNamespace(),
}));

import SettingsLayout from '@/app/(settings)/layout';

describe('SettingsLayout', () => {
  beforeEach(() => {
    mockUseNamespace.mockReturnValue({ isNamespaceResolved: true });
  });

  it('should render children', () => {
    render(
      <SettingsLayout>
        <div data-testid="child-content">Settings Content</div>
      </SettingsLayout>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('should not render AppSidebar', () => {
    render(
      <SettingsLayout>
        <div>Settings Content</div>
      </SettingsLayout>,
    );
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
  });

  it('should show loading spinner when namespace is not resolved', () => {
    mockUseNamespace.mockReturnValue({ isNamespaceResolved: false });

    render(
      <SettingsLayout>
        <div>Settings Content</div>
      </SettingsLayout>,
    );
    expect(screen.getByText('Loading Ark Dashboard...')).toBeInTheDocument();
  });
});
