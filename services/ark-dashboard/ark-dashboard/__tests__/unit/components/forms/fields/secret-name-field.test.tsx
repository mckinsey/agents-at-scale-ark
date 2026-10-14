import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SecretNameField } from '@/components/forms/fields/secret-name-field';

vi.mock('@/components/forms/shared/create-resource-dialog', () => ({
  CreateResourceButton: ({
    onCreated,
  }: {
    onCreated: (name: string) => void;
  }) => (
    <button type="button" onClick={() => onCreated('created-secret')}>
      Add New
    </button>
  ),
}));

const SECRETS = [{ name: 'openai-token' }, { name: 'github-pat' }];

const HINT = /Not in the list of Ark secrets/;

type FieldProps = React.ComponentProps<typeof SecretNameField>;

function renderField(props: Partial<FieldProps> = {}) {
  const onChange = vi.fn();
  render(
    <SecretNameField
      value=""
      onChange={onChange}
      secrets={SECRETS}
      aria-label="Secret name"
      {...props}
    />,
  );
  return { onChange };
}

function StatefulField({
  onChange,
  secrets = SECRETS,
}: {
  onChange: (value: string) => void;
  secrets?: FieldProps['secrets'];
}) {
  const [value, setValue] = useState('');
  return (
    <SecretNameField
      value={value}
      onChange={next => {
        setValue(next);
        onChange(next);
      }}
      secrets={secrets}
      aria-label="Secret name"
    />
  );
}

const input = () => screen.getByRole('combobox', { name: 'Secret name' });

describe('SecretNameField', () => {
  it('shows a stored name that is not in the list without changing it', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: 'kubectl-made' });

    expect(input()).toHaveValue('kubectl-made');
    expect(screen.getByText(HINT)).toBeInTheDocument();

    await user.click(input());
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a stored name when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: 'kubectl-made' });

    await user.click(input());
    await user.keyboard('{Escape}{Escape}');

    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('kubectl-made');
  });

  it('hides the hint while the list is loading', () => {
    renderField({ value: 'kubectl-made', isPending: true });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('hides the hint when the stored name is in the list', () => {
    renderField({ value: 'openai-token' });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('commits a typed name that is not in the list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulField onChange={onChange} />);

    await user.type(input(), 'new-secret');

    expect(onChange).toHaveBeenLastCalledWith('new-secret');
    expect(input()).toHaveValue('new-secret');
  });

  it('trims whitespace around a pasted name', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(input());
    await user.paste('  pasted-secret \n');

    expect(onChange).toHaveBeenLastCalledWith('pasted-secret');
  });

  it('commits a name picked from the list', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(input());
    await user.click(await screen.findByRole('option', { name: 'github-pat' }));

    expect(onChange).toHaveBeenLastCalledWith('github-pat');
  });

  it('says a name can be typed when the list is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulField onChange={onChange} secrets={[]} />);

    await user.click(input());
    await waitFor(() => {
      expect(
        screen.getByText(
          /No Ark secrets in this namespace\. Type a secret name\./,
        ),
      ).toBeInTheDocument();
    });

    await user.type(input(), 'kubectl-made');

    expect(onChange).toHaveBeenLastCalledWith('kubectl-made');
  });

  it('passes the name of a secret created with Add New', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(screen.getByRole('button', { name: 'Add New' }));

    expect(onChange).toHaveBeenCalledWith('created-secret');
  });

  it('clears the name', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({ value: 'openai-token' });

    await user.click(screen.getByRole('button', { name: 'Clear secret' }));

    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('disables the input when disabled', () => {
    renderField({ disabled: true });
    expect(input()).toBeDisabled();
  });
});
