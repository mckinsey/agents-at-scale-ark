import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatParameterFields } from '@/components/ui/chat-parameter-fields';

describe('ChatParameterFields', () => {
  it('renders nothing when there are no required parameters', () => {
    const { container } = render(
      <ChatParameterFields
        requiredParameters={[]}
        values={{}}
        onChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one labeled value input per required parameter', () => {
    render(
      <ChatParameterFields
        requiredParameters={['muting', 'tone']}
        values={{ muting: 'loud', tone: '' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('muting')).toBeInTheDocument();
    expect(screen.getByText('tone')).toBeInTheDocument();

    const inputs = screen.getAllByPlaceholderText('Enter value...');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue('loud');
    expect(inputs[1]).toHaveValue('');
  });

  it('calls onChange with the parameter name and new value', async () => {
    const onChange = vi.fn();
    render(
      <ChatParameterFields
        requiredParameters={['muting']}
        values={{ muting: '' }}
        onChange={onChange}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText('Enter value...'), 'x');

    expect(onChange).toHaveBeenCalledWith('muting', 'x');
  });

  it('disables the inputs when disabled', () => {
    render(
      <ChatParameterFields
        requiredParameters={['muting']}
        values={{ muting: '' }}
        onChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByPlaceholderText('Enter value...')).toBeDisabled();
  });
});
