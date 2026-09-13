import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  ALIAS_TOOLTIP_TEXT,
  AliasField,
} from '@/components/forms/fields/alias-field';

const OPTIONS = ['github-mcp', 'prod-key'];

function renderField(props: Partial<React.ComponentProps<typeof AliasField>> = {}) {
  const onChange = vi.fn();
  render(
    <AliasField value="" onChange={onChange} options={OPTIONS} {...props} />,
  );
  return { onChange };
}

describe('AliasField', () => {
  it('shows the default placeholder when none is provided', () => {
    renderField();
    expect(screen.getByPlaceholderText('Search aliases')).toBeInTheDocument();
  });

  it('shows an overridden placeholder', () => {
    renderField({ placeholder: 'e.g., api-key' });
    expect(screen.getByPlaceholderText('e.g., api-key')).toBeInTheDocument();
  });

  it('selects an existing option from the list', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(screen.getByPlaceholderText('Search aliases'));
    await waitFor(() => {
      expect(screen.getByText('github-mcp')).toBeInTheDocument();
    });
    await user.click(screen.getByText('github-mcp'));

    expect(onChange).toHaveBeenCalledWith('github-mcp');
  });

  it('does not commit typed text that is not an option', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.type(
      screen.getByPlaceholderText('Search aliases'),
      'not-a-real-alias',
    );
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the empty-list message when there are no options', async () => {
    const user = userEvent.setup();
    renderField({ options: [] });

    await user.click(screen.getByPlaceholderText('Search aliases'));

    await waitFor(() => {
      expect(screen.getByText('No aliases available')).toBeInTheDocument();
    });
  });

  it('shows the no-match message when the search has no results', async () => {
    const user = userEvent.setup();
    renderField();

    await user.type(
      screen.getByPlaceholderText('Search aliases'),
      'zzz-nope',
    );

    await waitFor(() => {
      expect(
        screen.getByText('No aliases match your search'),
      ).toBeInTheDocument();
    });
  });

  it('exposes a tooltip trigger explaining what an alias is', () => {
    renderField();

    expect(
      screen.getByRole('button', { name: 'About alias' }),
    ).toBeInTheDocument();
    expect(ALIAS_TOOLTIP_TEXT).toMatch(/alternative name/i);
  });

  it('shows a validation error', () => {
    renderField({ invalid: true, error: 'Alias is invalid' });
    expect(screen.getByText('Alias is invalid')).toBeInTheDocument();
  });

  it('disables the input when disabled', () => {
    renderField({ disabled: true });
    expect(screen.getByPlaceholderText('Search aliases')).toBeDisabled();
  });
});
