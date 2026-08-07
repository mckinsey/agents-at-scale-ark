import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagsField } from '@/components/forms/configuration-form/tags-field';

const onChange = vi.fn();

function renderField(value: string[] = []) {
  return render(<TagsField value={value} onChange={onChange} />);
}

describe('TagsField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a tag on Enter', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp{Enter}');

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('adds a tag on comma', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp,');

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('adds the pending tag on blur so it is not silently lost', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('rejects a tag Kubernetes would refuse as a label segment', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp servers{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/starting and ending with a letter or digit/i),
    ).toBeInTheDocument();
  });

  it('rejects a duplicate tag', async () => {
    const user = userEvent.setup();
    renderField(['mcp']);

    await user.type(screen.getByRole('textbox'), 'mcp{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/already been added/i)).toBeInTheDocument();
  });

  it('ignores an empty submission', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), '   {Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace when the input is empty', async () => {
    const user = userEvent.setup();
    renderField(['mcp', 'prod']);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('renders existing tags', () => {
    renderField(['mcp', 'prod']);

    expect(screen.getByText('mcp')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
  });
});
