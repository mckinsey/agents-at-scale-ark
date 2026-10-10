import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatParameterFields } from '@/components/ui/chat-parameter-fields';
import type {
  ParameterRow,
  TeamAgentParameters,
} from '@/lib/hooks/use-agent-query-parameters';

const noop = {
  onAddRow: vi.fn(),
  onChangeName: vi.fn(),
  onChangeValue: vi.fn(),
  onRemoveRow: vi.fn(),
};

const row = (
  id: string,
  name = '',
  value = '',
  agent?: string,
): ParameterRow => ({
  id,
  name,
  value,
  agent,
});

describe('ChatParameterFields', () => {
  it('renders nothing when there are no available parameters', () => {
    const { container } = render(
      <ChatParameterFields
        variant="agent"
        availableParameters={[]}
        rows={[]}
        canAddRow={false}
        {...noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the available count and an empty list with an enabled add button', () => {
    render(
      <ChatParameterFields
        variant="agent"
        availableParameters={['topic', 'text']}
        rows={[]}
        canAddRow
        {...noop}
      />,
    );

    expect(screen.getByText('2 variables available')).toBeInTheDocument();
    expect(screen.getByLabelText('Add variable')).toBeEnabled();
    expect(screen.queryByLabelText('Variable value')).not.toBeInTheDocument();
  });

  it('calls onAddRow when the add button is clicked', async () => {
    const onAddRow = vi.fn();
    render(
      <ChatParameterFields
        variant="agent"
        availableParameters={['topic', 'text']}
        rows={[]}
        canAddRow
        {...noop}
        onAddRow={onAddRow}
      />,
    );

    await userEvent.click(screen.getByLabelText('Add variable'));
    expect(onAddRow).toHaveBeenCalledTimes(1);
  });

  it('disables the add button when the cap is reached', () => {
    render(
      <ChatParameterFields
        variant="agent"
        availableParameters={['topic', 'text']}
        rows={[row('r1', 'topic', 'a'), row('r2', 'text', 'b')]}
        canAddRow={false}
        {...noop}
      />,
    );

    expect(screen.getByLabelText('Add variable')).toBeDisabled();
  });

  it('renders one value input per row and reports value edits by row id', async () => {
    const onChangeValue = vi.fn();
    render(
      <ChatParameterFields
        variant="agent"
        availableParameters={['topic', 'text']}
        rows={[row('r1', 'topic', ''), row('r2', '', '')]}
        canAddRow={false}
        {...noop}
        onChangeValue={onChangeValue}
      />,
    );

    const inputs = screen.getAllByLabelText('Variable value');
    expect(inputs).toHaveLength(2);

    await userEvent.type(inputs[0], 'x');
    expect(onChangeValue).toHaveBeenCalledWith('r1', 'x');
  });

  it('calls onRemoveRow with the row id when trash is clicked', async () => {
    const onRemoveRow = vi.fn();
    render(
      <ChatParameterFields
        variant="agent"
        availableParameters={['topic', 'text']}
        rows={[row('r1', 'topic', 'a')]}
        canAddRow
        {...noop}
        onRemoveRow={onRemoveRow}
      />,
    );

    await userEvent.click(screen.getByLabelText('Remove variable'));
    expect(onRemoveRow).toHaveBeenCalledWith('r1');
  });

  it('disables row controls when disabled', () => {
    render(
      <ChatParameterFields
        variant="agent"
        availableParameters={['topic']}
        rows={[row('r1', 'topic', 'a')]}
        canAddRow={false}
        disabled
        {...noop}
      />,
    );

    expect(screen.getByLabelText('Variable value')).toBeDisabled();
    expect(screen.getByLabelText('Remove variable')).toBeDisabled();
  });

  describe('team variant', () => {
    const teamAgents: TeamAgentParameters[] = [
      { name: 'agent-1', parameters: ['topic', 'region'] },
      { name: 'agent-2', parameters: ['language'] },
    ];

    it('counts every variable across member agents', () => {
      render(
        <ChatParameterFields
          variant="team"
          teamAgents={teamAgents}
          rows={[]}
          canAddRow
          onChangeAgent={vi.fn()}
          {...noop}
        />,
      );

      expect(screen.getByText('3 variables available')).toBeInTheDocument();
    });

    it('renders an agent dropdown and a variable dropdown per row', () => {
      render(
        <ChatParameterFields
          variant="team"
          teamAgents={teamAgents}
          rows={[row('r1', '', '', '')]}
          canAddRow
          onChangeAgent={vi.fn()}
          {...noop}
        />,
      );

      expect(screen.getByLabelText('Choose agent')).toBeInTheDocument();
      expect(screen.getByLabelText('Choose variable')).toBeInTheDocument();
    });

    it('disables the variable dropdown until an agent is chosen', () => {
      render(
        <ChatParameterFields
          variant="team"
          teamAgents={teamAgents}
          rows={[row('r1', '', '', '')]}
          canAddRow
          onChangeAgent={vi.fn()}
          {...noop}
        />,
      );

      expect(screen.getByLabelText('Choose variable')).toBeDisabled();
    });

    it('enables the variable dropdown once a row has an agent', () => {
      render(
        <ChatParameterFields
          variant="team"
          teamAgents={teamAgents}
          rows={[row('r1', '', '', 'agent-1')]}
          canAddRow
          onChangeAgent={vi.fn()}
          {...noop}
        />,
      );

      expect(screen.getByLabelText('Choose variable')).toBeEnabled();
    });
  });
});
