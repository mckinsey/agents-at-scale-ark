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
    source: 'value',
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

  it('renders "0 results" and Add new when empty', () => {
    render(<ParameterEditor parameters={[]} onChange={vi.fn()} />);
    expect(screen.getByText('0 results')).toBeInTheDocument();
    expect(screen.getByText('Add new')).toBeInTheDocument();
  });

  it('clicking Add new calls onChange with a new editable value variable', async () => {
    const onChange = vi.fn();
    render(<ParameterEditor parameters={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add new/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Parameter[];
    expect(next).toHaveLength(1);
    expect(next[0].source).toBe('value');
  });

  it('typing into a row name input calls onChange with updated name', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'a' })]}
        onChange={onChange}
      />,
    );
    const input = screen.getByDisplayValue('a');
    await userEvent.type(input, 'b');
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as Parameter[];
    expect(last[0].name).toBe('ab');
  });

  it('clicking the trash button removes an editable row', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'a' }), makeParam({ name: 'b' })]}
        onChange={onChange}
      />,
    );
    const trashButtons = screen.getAllByRole('button', {
      name: /remove parameter/i,
    });
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
    expect(
      screen.getByText(/undefined parameters in prompt/i),
    ).toBeInTheDocument();
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
    // added as an editable/deletable variable, not a read-only query param
    expect(next[0].source).toBe('value');
  });

  it('shows N results count', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'a' }), makeParam({ name: 'b' })]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('2 results')).toBeInTheDocument();
  });

  it('disabled prop disables the Add new button', () => {
    render(<ParameterEditor parameters={[]} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /add new/i })).toBeDisabled();
  });

  it('renders a query parameter read-only: static name, "Set in chat", no delete', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'topic', source: 'queryParameter' })]}
        onChange={vi.fn()}
        prompt="Talk about {{.topic}}"
      />,
    );
    expect(screen.getByText('1 result')).toBeInTheDocument();
    // shown as static text, not an editable input
    expect(screen.getByText('topic')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('topic')).not.toBeInTheDocument();
    expect(screen.getByText('Set in chat')).toBeInTheDocument();
    // no per-row delete action for query parameters
    expect(
      screen.queryByRole('button', { name: /remove parameter/i }),
    ).not.toBeInTheDocument();
  });

  it('renders query parameters read-only even when not in the prompt', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'text', source: 'queryParameter' })]}
        onChange={vi.fn()}
        prompt="No variables here"
      />,
    );
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('Set in chat')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove parameter/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps non-query "true" variables editable with a delete action', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'static', source: 'value' })]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('static')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove parameter/i }),
    ).toBeInTheDocument();
  });

  it('renders a value input for value-source variables and reports edits', async () => {
    const onChange = vi.fn();
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'role', source: 'value', value: '' })]}
        onChange={onChange}
      />,
    );
    const valueInput = screen.getByRole('textbox', {
      name: /parameter 1 value/i,
    });
    await userEvent.type(valueInput, 'x');
    const last = onChange.mock.calls.at(-1)![0] as Parameter[];
    expect(last[0].value).toBe('x');
  });

  it('does not render a value input for read-only query params', () => {
    render(
      <ParameterEditor
        parameters={[makeParam({ name: 'topic', source: 'queryParameter' })]}
        onChange={vi.fn()}
        prompt="Talk about {{.topic}}"
      />,
    );
    expect(
      screen.queryByRole('textbox', { name: /parameter 1 value/i }),
    ).not.toBeInTheDocument();
  });
});
