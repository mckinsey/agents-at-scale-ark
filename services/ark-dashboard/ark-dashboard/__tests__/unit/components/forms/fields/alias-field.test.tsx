import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AliasField } from '@/components/forms/fields/alias-field';

describe('AliasField', () => {
  it('shows the selected value in the input', () => {
    render(
      <AliasField value="mcp-url" onChange={vi.fn()} options={['mcp-url']} />,
    );

    expect(screen.getByLabelText('Alias')).toHaveValue('mcp-url');
  });

  it('lists the existing options', async () => {
    const user = userEvent.setup();
    render(
      <AliasField
        value=""
        onChange={vi.fn()}
        options={['mcp-url', 'model-timeout']}
      />,
    );

    await user.click(screen.getByLabelText('Alias'));

    const options = await screen.findAllByRole('option');

    expect(options.map(option => option.textContent)).toEqual([
      'mcp-url',
      'model-timeout',
    ]);
  });

  it('filters the options as the user types', async () => {
    const user = userEvent.setup();
    render(
      <AliasField
        value=""
        onChange={vi.fn()}
        options={['mcp-url', 'model-timeout', 'retry-count']}
      />,
    );

    await user.type(screen.getByLabelText('Alias'), 'mo');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });

    expect(
      screen.getByRole('option', { name: 'model-timeout' }),
    ).toBeInTheDocument();
  });

  it('selects an existing option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AliasField value="" onChange={onChange} options={['mcp-url']} />);

    await user.click(screen.getByLabelText('Alias'));
    await user.click(await screen.findByRole('option', { name: 'mcp-url' }));

    expect(onChange).toHaveBeenCalledWith('mcp-url');
  });

  it('does not commit typed text that is not an option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AliasField value="" onChange={onChange} options={['mcp-url']} />);

    await user.type(screen.getByLabelText('Alias'), 'invented-alias{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the selected value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AliasField value="mcp-url" onChange={onChange} options={['mcp-url']} />,
    );

    await user.click(screen.getByRole('button', { name: 'Clear alias' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('says no aliases exist when there are no options', async () => {
    const user = userEvent.setup();
    render(<AliasField value="" onChange={vi.fn()} options={[]} />);

    await user.click(screen.getByLabelText('Alias'));

    expect(await screen.findByText('No aliases available')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('says nothing matches when the search excludes every option', async () => {
    const user = userEvent.setup();
    render(<AliasField value="" onChange={vi.fn()} options={['mcp-url']} />);

    await user.type(screen.getByLabelText('Alias'), 'zzz');

    expect(
      await screen.findByText('No aliases match your search'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
