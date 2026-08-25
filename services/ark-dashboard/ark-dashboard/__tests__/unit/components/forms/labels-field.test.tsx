import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LabelsField } from '@/components/forms/configuration-form/labels-field';
import { validateLabelDraft } from '@/components/forms/configuration-form/types';

const onChange = vi.fn();

function Harness({ initial }: Readonly<{ initial: string[] }>) {
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);
  const message = validateLabelDraft(draft, initial);

  return (
    <LabelsField
      value={initial}
      onChange={onChange}
      draft={draft}
      onDraftChange={next => {
        setDraft(next);
        setTouched(false);
      }}
      onDraftTouched={() => setTouched(true)}
      error={touched && message ? message : undefined}
    />
  );
}

function renderField(value: string[] = []) {
  return render(<Harness initial={value} />);
}

describe('LabelsField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a label on Enter', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp{Enter}');

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('adds a label on comma', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp,');

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('adds the pending label on blur so it is not silently lost', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('rejects a label Kubernetes would refuse as a label key segment', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp servers{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(/starting and ending with a letter or digit/i),
    ).toBeInTheDocument();
  });

  it('keeps a rejected label in the input instead of discarding it', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByRole('textbox'), 'mcp servers{Enter}');

    expect(screen.getByRole('textbox')).toHaveValue('mcp servers');
  });

  it('rejects a duplicate label', async () => {
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

  it('removes the last label on Backspace when the input is empty', async () => {
    const user = userEvent.setup();
    renderField(['mcp', 'prod']);

    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['mcp']);
  });

  it('renders existing labels', () => {
    renderField(['mcp', 'prod']);

    expect(screen.getByText('mcp')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
  });
});
