import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PanelToggleButton } from '@/components/common/panel-toggle-button';

describe('PanelToggleButton', () => {
  it('should render with "Show configuration" title when collapsed', () => {
    render(<PanelToggleButton isCollapsed={true} onToggle={vi.fn()} />);
    expect(screen.getByTitle('Show configuration')).toBeInTheDocument();
  });

  it('should render with "Hide configuration" title when expanded', () => {
    render(<PanelToggleButton isCollapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByTitle('Hide configuration')).toBeInTheDocument();
  });

  it('should call onToggle when clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<PanelToggleButton isCollapsed={false} onToggle={onToggle} />);

    await user.click(screen.getByTitle('Hide configuration'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
