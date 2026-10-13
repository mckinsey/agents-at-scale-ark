import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OutputSchemaField } from '@/components/common/output-schema-field';

describe('OutputSchemaField', () => {
  it('reports edits through onChange', () => {
    const onChange = vi.fn();
    render(<OutputSchemaField value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Output schema'), {
      target: { value: '{"type":"object"}' },
    });

    expect(onChange).toHaveBeenCalledWith('{"type":"object"}');
  });

  it('pretty-prints a valid schema when Format is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OutputSchemaField value='{"type":"object"}' onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Format' }));

    expect(onChange).toHaveBeenCalledWith('{\n  "type": "object"\n}');
  });

  it('shows the validation error and disables Format for invalid JSON', () => {
    render(<OutputSchemaField value='{"type":' onChange={vi.fn()} />);

    expect(screen.getByText('Enter valid JSON.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
  });

  it('disables Format when the field is empty', () => {
    render(<OutputSchemaField value="" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
  });
});
