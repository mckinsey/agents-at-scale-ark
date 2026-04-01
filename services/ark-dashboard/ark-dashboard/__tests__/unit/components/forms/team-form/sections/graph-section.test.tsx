import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { GraphSection } from '@/components/forms/team-form/sections/graph-section';
import { Form } from '@/components/ui/form';
import type { TeamMember } from '@/lib/services';

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  strategy: z.string(),
  loops: z.boolean(),
  maxTurns: z.string().optional(),
  selectorAgent: z.string().optional(),
  selectorPrompt: z.string().optional(),
});

const selectedMembers: TeamMember[] = [
  { name: 'agent-1', type: 'agent' },
  { name: 'agent-2', type: 'agent' },
];

function Wrapper({
  strategy = 'graph',
  graphEdges = [] as Array<{ from: string; to: string }>,
  unavailableMembers = [] as TeamMember[],
  onGraphEdgesChange = vi.fn(),
  disabled = false,
  selectorAgent = '',
}: {
  strategy?: string;
  graphEdges?: Array<{ from: string; to: string }>;
  unavailableMembers?: TeamMember[];
  onGraphEdgesChange?: (edges: Array<{ from: string; to: string }>) => void;
  disabled?: boolean;
  selectorAgent?: string;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      strategy,
      loops: false,
      maxTurns: '',
      selectorAgent,
      selectorPrompt: '',
    },
  });

  return (
    <Form {...form}>
      <GraphSection
        form={form}
        selectedMembers={selectedMembers}
        graphEdges={graphEdges}
        unavailableMembers={unavailableMembers}
        onGraphEdgesChange={onGraphEdgesChange}
        disabled={disabled}
      />
    </Form>
  );
}

describe('GraphSection', () => {
  it('should render nothing when strategy is round-robin', () => {
    const { container } = render(<Wrapper strategy="round-robin" />);
    expect(container.innerHTML).toBe('');
  });

  it('should render nothing when strategy is sequential', () => {
    const { container } = render(<Wrapper strategy="sequential" />);
    expect(container.innerHTML).toBe('');
  });

  it('should render for graph strategy', () => {
    render(<Wrapper strategy="graph" />);
    expect(screen.getByText('Graph Edges')).toBeInTheDocument();
  });

  it('should render for selector strategy', () => {
    render(<Wrapper strategy="selector" />);
    expect(screen.getByText('Graph Edges')).toBeInTheDocument();
  });

  it('should show required indicator for graph strategy', () => {
    render(<Wrapper strategy="graph" />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('should not show required indicator for selector strategy', () => {
    render(<Wrapper strategy="selector" />);
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('should show empty state when no edges', () => {
    render(<Wrapper />);
    expect(screen.getByText(/No edges defined/)).toBeInTheDocument();
  });

  it('should call onGraphEdgesChange when Add Edge is clicked', async () => {
    const onGraphEdgesChange = vi.fn();
    const user = userEvent.setup();
    render(<Wrapper onGraphEdgesChange={onGraphEdgesChange} />);

    await user.click(screen.getByText('Add Edge'));
    expect(onGraphEdgesChange).toHaveBeenCalledWith([{ from: '', to: '' }]);
  });

  it('should render existing edges', () => {
    render(
      <Wrapper
        graphEdges={[{ from: 'agent-1', to: 'agent-2' }]}
      />,
    );
    expect(screen.queryByText(/No edges defined/)).not.toBeInTheDocument();
  });

  it('should allow removing an edge', async () => {
    const onGraphEdgesChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Wrapper
        graphEdges={[{ from: 'agent-1', to: 'agent-2' }]}
        onGraphEdgesChange={onGraphEdgesChange}
      />,
    );

    await user.click(screen.getByLabelText('Remove edge'));
    expect(onGraphEdgesChange).toHaveBeenCalledWith([]);
  });

  it('should show graph-specific description for graph strategy', () => {
    render(<Wrapper strategy="graph" />);
    expect(
      screen.getByText(/Define the flow between agents/),
    ).toBeInTheDocument();
  });

  it('should show selector-specific description for selector strategy', () => {
    render(<Wrapper strategy="selector" />);
    expect(
      screen.getByText(/Define graph constraints/),
    ).toBeInTheDocument();
  });

  it('should show no-outgoing-edges warning for selector strategy with edges', () => {
    render(
      <Wrapper
        strategy="selector"
        graphEdges={[{ from: 'agent-1', to: 'agent-2' }]}
      />,
    );
    expect(
      screen.getByText(/have no outgoing edges/),
    ).toBeInTheDocument();
    expect(screen.getByText(/have no outgoing edges/)).toHaveTextContent('agent-2');
  });

  it('should not show no-outgoing-edges warning when all agents have outgoing edges', () => {
    render(
      <Wrapper
        strategy="selector"
        graphEdges={[
          { from: 'agent-1', to: 'agent-2' },
          { from: 'agent-2', to: 'agent-1' },
        ]}
      />,
    );
    expect(
      screen.queryByText(/have no outgoing edges/),
    ).not.toBeInTheDocument();
  });

  it('should not show no-outgoing-edges warning for graph strategy', () => {
    render(
      <Wrapper
        strategy="graph"
        graphEdges={[{ from: 'agent-1', to: 'agent-2' }]}
      />,
    );
    expect(
      screen.queryByText(/have no outgoing edges/),
    ).not.toBeInTheDocument();
  });

});
