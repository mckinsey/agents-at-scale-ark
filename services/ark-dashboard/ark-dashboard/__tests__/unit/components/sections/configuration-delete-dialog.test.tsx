import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigurationDeleteDialog } from '@/components/sections/configuration-delete-dialog';

const useGetConfigurationReferences = vi.fn();

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetConfigurationReferences: (name: string | undefined) =>
    useGetConfigurationReferences(name),
}));

const onConfirm = vi.fn();

function renderDialog(open = true) {
  return render(
    <ConfigurationDeleteDialog
      name="github-mcp-url"
      open={open}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
}

describe('ConfigurationDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGetConfigurationReferences.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it('only queries references once the dialog is open', () => {
    renderDialog(false);

    expect(useGetConfigurationReferences).toHaveBeenCalledWith(undefined);
  });

  it('queries references for the configuration when open', () => {
    renderDialog();

    expect(useGetConfigurationReferences).toHaveBeenCalledWith(
      'github-mcp-url',
    );
  });

  it('lists every resource that reads the configuration', () => {
    useGetConfigurationReferences.mockReturnValue({
      data: [
        { kind: 'MCPServer', name: 'github-mcp', field: 'spec.address' },
        { kind: 'Memory', name: 'shared-memory', field: 'spec.address' },
      ],
      isLoading: false,
    });

    renderDialog();

    expect(screen.getByText(/2 resources still read/i)).toBeInTheDocument();
    expect(screen.getByText('github-mcp')).toBeInTheDocument();
    expect(screen.getByText('shared-memory')).toBeInTheDocument();
  });

  it('uses the singular form for a single reference', () => {
    useGetConfigurationReferences.mockReturnValue({
      data: [{ kind: 'MCPServer', name: 'github-mcp', field: 'spec.address' }],
      isLoading: false,
    });

    renderDialog();

    expect(screen.getByText(/1 resource still reads/i)).toBeInTheDocument();
  });

  it('still allows deletion when the configuration is referenced', async () => {
    const user = userEvent.setup();
    useGetConfigurationReferences.mockReturnValue({
      data: [{ kind: 'MCPServer', name: 'github-mcp', field: 'spec.address' }],
      isLoading: false,
    });

    renderDialog();
    const deleteButton = screen.getByRole('button', { name: 'Delete' });

    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows no warning when nothing references the configuration', () => {
    renderDialog();

    expect(screen.queryByText(/still read/i)).not.toBeInTheDocument();
  });

  it('reports that it is still checking while references load', () => {
    useGetConfigurationReferences.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderDialog();

    expect(screen.getByText(/checking which resources/i)).toBeInTheDocument();
  });
});
