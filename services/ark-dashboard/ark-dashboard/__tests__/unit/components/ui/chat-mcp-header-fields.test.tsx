import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  ChatMcpHeaderFields,
  type ChatMcpHeaderFieldsProps,
} from '@/components/ui/chat-mcp-header-fields';
import type * as McpHeaderRowModule from '@/components/ui/mcp-header-row';
import {
  type McpHeaderRow,
  createMcpHeaderRow,
} from '@/lib/utils/mcp-header-overrides';

vi.mock('@/lib/hooks/use-secret-key-options', () => ({
  useSecretKeyOptions: () => ({ options: [], loaded: true }),
}));

vi.mock('@/components/ui/mcp-header-row', async importOriginal => ({
  ...(await importOriginal<typeof McpHeaderRowModule>()),
  McpHeaderRowFields: ({
    row,
    onChange,
    onRemove,
  }: {
    row: McpHeaderRow;
    onChange: (updates: Partial<McpHeaderRow>) => void;
    onRemove: () => void;
  }) => (
    <div data-testid="header-row">
      <span>{row.name}</span>
      <button onClick={() => onChange({ name: 'X-New' })}>rename</button>
      <button onClick={onRemove}>remove</button>
    </div>
  ),
}));

const row: McpHeaderRow = {
  ...createMcpHeaderRow(),
  id: 'r1',
  name: 'X-Token',
};

function renderFields(props: Partial<ChatMcpHeaderFieldsProps> = {}) {
  const handlers = {
    onAddRow: vi.fn(),
    onUpdateRow: vi.fn(),
    onRemoveRow: vi.fn(),
  };
  render(
    <ChatMcpHeaderFields
      rows={[row]}
      nameOptionsFor={() => []}
      namesForServer={() => []}
      canAddRow
      errors={{}}
      serverNames={[]}
      effectiveCount={1}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ChatMcpHeaderFields', () => {
  it('stays collapsed and flags errors until expanded', async () => {
    renderFields({ hasErrors: true });
    expect(
      screen.getByTestId('chat-mcp-header-effective-count'),
    ).toHaveTextContent('1 effective');
    expect(screen.getByText('Fix to send')).toBeInTheDocument();
    expect(screen.queryByTestId('header-row')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /MCP header overrides/ }),
    );
    expect(screen.queryByText('Fix to send')).not.toBeInTheDocument();
    expect(screen.getByText('X-Token')).toBeInTheDocument();
  });

  it('forwards row edits, removals and adds by row id', async () => {
    const handlers = renderFields();
    await userEvent.click(
      screen.getByRole('button', { name: /MCP header overrides/ }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'rename' }));
    expect(handlers.onUpdateRow).toHaveBeenCalledWith('r1', { name: 'X-New' });

    await userEvent.click(screen.getByRole('button', { name: 'remove' }));
    expect(handlers.onRemoveRow).toHaveBeenCalledWith('r1');

    await userEvent.click(screen.getByRole('button', { name: 'Add new' }));
    expect(handlers.onAddRow).toHaveBeenCalled();
  });

  it('disables adding when no header can be overridden', async () => {
    renderFields({ rows: [], canAddRow: false });
    await userEvent.click(
      screen.getByRole('button', { name: /MCP header overrides/ }),
    );
    expect(screen.queryByText('This query only')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new' })).toBeDisabled();
  });
});
