import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResourceStudioLayout } from '@/components/common/resource-studio-layout';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('namespace=test-ns'),
}));

const baseProps = {
  listHref: '/agents',
  listLabel: 'Agents',
  displayName: 'my-agent',
  saving: false,
  hasChanges: false,
  readOnlyMode: false,
  onSave: vi.fn(),
  switcherValue: 'my-agent',
  switcherPlaceholder: 'Select agent',
  switcherItems: [{ name: 'my-agent' }],
  switcherLoading: false,
  onSwitcherSelect: vi.fn(),
  showYaml: false,
  onToggleYaml: vi.fn(),
  yamlContent: <div>yaml-content</div>,
  formContent: <div>form-content</div>,
  chatPanel: <div>chat-panel</div>,
};

describe('ResourceStudioLayout', () => {
  it('renders breadcrumb, form content and chat panel', () => {
    render(<ResourceStudioLayout {...baseProps} />);

    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getAllByText('my-agent').length).toBeGreaterThan(0);
    expect(screen.getByText('form-content')).toBeInTheDocument();
    expect(screen.getByText('chat-panel')).toBeInTheDocument();
    expect(screen.queryByText('yaml-content')).not.toBeInTheDocument();
  });

  it('renders yaml content instead of form when showYaml is true', () => {
    render(<ResourceStudioLayout {...baseProps} showYaml={true} />);

    expect(screen.getByText('yaml-content')).toBeInTheDocument();
    expect(screen.queryByText('form-content')).not.toBeInTheDocument();
  });

  it('disables Save changes when there are no changes', () => {
    render(<ResourceStudioLayout {...baseProps} hasChanges={false} />);

    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();
  });

  it('enables Save and calls onSave when there are changes', () => {
    const onSave = vi.fn();
    render(
      <ResourceStudioLayout {...baseProps} hasChanges={true} onSave={onSave} />,
    );

    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeEnabled();
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('collapses and expands the left configuration panel', () => {
    render(<ResourceStudioLayout {...baseProps} />);

    expect(screen.getByText('form-content')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /hide configuration/i }),
    );
    expect(screen.queryByText('form-content')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /show configuration/i }),
    );
    expect(screen.getByText('form-content')).toBeInTheDocument();
  });
});
