import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentsPage from '@/app/(dashboard)/agents/page';

const mockOpenApiDialog = vi.fn();
const mockOpenAddEditor = vi.fn();

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({
    currentPage,
    actions,
  }: {
    currentPage: string;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="page-header">
      <div data-testid="current-page">{currentPage}</div>
      <div data-testid="page-actions">{actions}</div>
    </div>
  ),
}));

vi.mock('@/components/sections/agents-section', () => {
  const React = require('react');
  return {
    AgentsSection: React.forwardRef(
      (
        _props: object,
        ref: React.ForwardedRef<{
          openAddEditor: () => void;
          openApiDialog: () => void;
        }>,
      ) => {
        if (ref && typeof ref === 'object') {
          (
            ref as React.MutableRefObject<{
              openAddEditor: () => void;
              openApiDialog: () => void;
            }>
          ).current = {
            openAddEditor: mockOpenAddEditor,
            openApiDialog: mockOpenApiDialog,
          };
        }
        return React.createElement(
          'div',
          { 'data-testid': 'agents-section' },
          'Agents Section',
        );
      },
    ),
  };
});

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page header with correct title', () => {
    render(<AgentsPage />);
    expect(screen.getByTestId('current-page')).toHaveTextContent('Agents');
  });

  it('should render agents section', () => {
    render(<AgentsPage />);
    expect(screen.getByTestId('agents-section')).toBeInTheDocument();
  });

  it('should render "Use via API" button', () => {
    render(<AgentsPage />);
    const actionsContainer = screen.getByTestId('page-actions');
    expect(actionsContainer).toBeInTheDocument();
    expect(actionsContainer.textContent).toContain('Use via API');
  });

  it('should render "Create Agent" button', () => {
    render(<AgentsPage />);
    const actionsContainer = screen.getByTestId('page-actions');
    expect(actionsContainer.textContent).toContain('Create Agent');
  });

  it('should call openApiDialog when "Use via API" button is clicked', async () => {
    const user = userEvent.setup();
    render(<AgentsPage />);

    const apiButton = screen.getByRole('button', { name: /Use via API/i });
    expect(apiButton).toBeInTheDocument();

    await user.click(apiButton);
    expect(mockOpenApiDialog).toHaveBeenCalled();
  });

  it('should navigate to "Create Agent" page when "Create Agent" button is clicked', async () => {
    render(<AgentsPage />);

    const createButton = screen.getByRole('link', { name: /Create Agent/i });
    expect(createButton).toBeInTheDocument();
    expect(createButton).toHaveAttribute('href', '/agents/new');
  });
});
