import { render, screen } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewWorkflowTemplatePage from '@/app/(dashboard)/workflow-templates/new/page';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';

const studioProps = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/hooks/use-workflow-template-access', () => ({
  useWorkflowTemplateAccess: vi.fn(),
}));

vi.mock('@/components/workflow-studio/workflow-studio', () => ({
  WorkflowStudio: (props: Record<string, unknown>) => {
    studioProps(props);
    return <div data-testid="workflow-studio" />;
  },
}));

describe('NewWorkflowTemplatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWorkflowTemplateAccess).mockReturnValue({
      canCreate: true,
      canUpdate: true,
      loading: false,
    });
  });

  it('passes name, title and description query params into the studio', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams({
        name: 'my-workflow',
        title: 'My Title',
        description: 'A helpful description',
      }) as unknown as ReturnType<typeof useSearchParams>,
    );

    render(<NewWorkflowTemplatePage />);

    expect(screen.getByTestId('workflow-studio')).toBeInTheDocument();
    expect(studioProps).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'new',
        initialName: 'my-workflow',
        initialTitle: 'My Title',
        initialDescription: 'A helpful description',
      }),
    );
  });

  it('leaves optional meta params undefined when absent', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams({
        name: 'my-workflow',
      }) as unknown as ReturnType<typeof useSearchParams>,
    );

    render(<NewWorkflowTemplatePage />);

    expect(studioProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialName: 'my-workflow',
        initialTitle: undefined,
        initialDescription: undefined,
      }),
    );
  });

  it('shows the permission message when the user cannot create', () => {
    vi.mocked(useWorkflowTemplateAccess).mockReturnValue({
      canCreate: false,
      canUpdate: false,
      loading: false,
    });
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    );

    render(<NewWorkflowTemplatePage />);

    expect(screen.queryByTestId('workflow-studio')).not.toBeInTheDocument();
    expect(
      screen.getByText(/don't have permission to create/i),
    ).toBeInTheDocument();
  });
});
