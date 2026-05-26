import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ParameterEditor,
  type Parameter,
} from '@/components/ui/parameter-editor';

function makeParam(overrides: Partial<Parameter> = {}): Parameter {
  return {
    name: 'foo',
    source: 'queryParameter',
    value: '',
    queryParameterName: '',
    overrideQueryName: false,
    ...overrides,
  };
}

describe('ParameterEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashed empty state in default variant when no parameters', () => {
    render(<ParameterEditor parameters={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no parameters defined/i)).toBeInTheDocument();
  });

  it('renders "0 results" and Add new in compact variant when empty', () => {
    render(
      <ParameterEditor parameters={[]} onChange={vi.fn()} variant="compact" />,
    );
    expect(screen.getByText('0 results')).toBeInTheDocument();
    expect(screen.getByText('Add new')).toBeInTheDocument();
  });

  it('clicking Add (default variant) calls onChange with a new entry', async () => {
    const onChange = vi.fn();
    render(<ParameterEditor parameters={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('clicking Add new (compact variant) calls onChange with a new entry', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor
        parameters={[]}
        onChange={onChange}
        variant="compact"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /add new/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('typing into a row name input calls onChange with updated name', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor parameters={[makeParam({ name: 'a' })]} onChange={onChange} />,
    );
    const input = screen.getByDisplayValue('a');
    await userEvent.type(input, 'b');
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as Parameter[];
    expect(last[0].name).toBe('ab');
  });

  it('clicking the trash button (default variant) removes the row', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'a' }), makeParam({ name: 'b' })]}
        onChange={onChange}
      />,
    );
    const trashButtons = screen
      .getAllByRole('button')
      .filter(b => b.querySelector('svg.lucide-trash2'));
    await userEvent.click(trashButtons[0]);
    const next = onChange.mock.calls.at(-1)![0] as Parameter[];
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('b');
  });

  it('shows undefined-parameters warning when prompt references missing params', () => {
    render(
      <ParameterEditor
        parameters={[]}
        onChange={vi.fn()}
        prompt="Hello {{.missing}}"
      />,
    );
    expect(screen.getByText(/undefined parameters in prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/missing/)).toBeInTheDocument();
  });

  it('clicking an undefined-param chip adds it via onChange', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor
        parameters={[]}
        onChange={onChange}
        prompt="Hi {{.role}}"
      />,
    );
    const chip = screen
      .getAllByRole('button')
      .find(b => b.textContent?.includes('role'))!;
    await userEvent.click(chip);
    const next = onChange.mock.calls.at(-1)![0] as Parameter[];
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('role');
  });

  it('shows "X unused" in stats when a parameter is not referenced in the prompt', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'orphan' })]}
        onChange={vi.fn()}
        prompt="No params here"
      />,
    );
    expect(screen.getByText(/1 unused/)).toBeInTheDocument();
  });

  it('shows N results count in compact variant', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'a' }), makeParam({ name: 'b' })]}
        onChange={vi.fn()}
        variant="compact"
      />,
    );
    expect(screen.getByText('2 results')).toBeInTheDocument();
  });

  it('disabled prop disables the Add button', () => {
    render(<ParameterEditor parameters={[]} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
  });
});
