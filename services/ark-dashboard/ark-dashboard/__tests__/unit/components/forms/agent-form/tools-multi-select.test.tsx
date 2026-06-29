import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolsMultiSelect } from '@/components/forms/agent-form/sections/tools-multi-select';
import type { Tool } from '@/lib/services';

const tools: Tool[] = [
  { id: '1', name: 'search', description: 'Search the web' } as Tool,
  { id: '2', name: 'calculator', description: 'Do math' } as Tool,
  { id: '3', name: 'weather' } as Tool,
];

const noop = {
  isToolSelected: () => false,
  onToggle: vi.fn(),
};

describe('ToolsMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the "Select tools" placeholder when nothing is selected', () => {
    render(<ToolsMultiSelect availableTools={tools} {...noop} />);
    expect(screen.getByPlaceholderText('Select tools')).toBeInTheDocument();
  });

  it('shows a loading placeholder while tools load', () => {
    render(<ToolsMultiSelect availableTools={[]} {...noop} toolsLoading />);
    expect(screen.getByPlaceholderText('Loading tools...')).toBeInTheDocument();
  });

  it('renders selected tools as chips and hides the placeholder', () => {
    render(
      <ToolsMultiSelect
        availableTools={tools}
        isToolSelected={name => name === 'search'}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('search')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Select tools'),
    ).not.toBeInTheDocument();
  });

  it('filters the list by name as the user types, then toggles on select', async () => {
    const onToggle = vi.fn();
    render(
      <ToolsMultiSelect
        availableTools={tools}
        isToolSelected={() => false}
        onToggle={onToggle}
      />,
    );

    const input = screen.getByLabelText('Select tools');
    await userEvent.click(input);
    await userEvent.type(input, 'calc');

    const option = await screen.findByText('calculator');
    expect(screen.queryByText('search')).not.toBeInTheDocument();

    await userEvent.click(option);
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'calculator' }),
      true,
    );
  });

  it('caps visible chips at 4 and shows an overflow count', () => {
    const many: Tool[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      name: `tool-${i}`,
    })) as Tool[];
    render(
      <ToolsMultiSelect
        availableTools={many}
        isToolSelected={() => true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('tool-0')).toBeInTheDocument();
    expect(screen.getByText('tool-3')).toBeInTheDocument();
    // 5th and 6th are collapsed into a "+2" overflow badge
    expect(screen.queryByText('tool-4')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders unavailable tools and deletes them', async () => {
    const onDeleteUnavailable = vi.fn();
    render(
      <ToolsMultiSelect
        availableTools={tools}
        {...noop}
        unavailableTools={[{ id: '9', name: 'ghost-tool' } as Tool]}
        onDeleteUnavailable={onDeleteUnavailable}
      />,
    );

    expect(screen.getByText('ghost-tool')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /remove|delete|ghost-tool/i }),
    );
    expect(onDeleteUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ghost-tool' }),
    );
  });
});
