import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMcpHeaderFields } from '@/components/ui/chat-mcp-header-fields';
import type { SecretKeyOption } from '@/lib/hooks/use-secret-key-options';
import {
  type McpHeaderRow,
  createMcpHeaderRow,
} from '@/lib/utils/mcp-header-overrides';

const SECRET_OPTIONS: SecretKeyOption[] = [
  {
    value: 'shared/token',
    label: 'shared · token',
    secretName: 'shared',
    secretKey: 'token',
    scope: 'shared',
  },
  {
    value: 'u-0123456789abcdef-mine/token',
    label: 'mine · token',
    secretName: 'u-0123456789abcdef-mine',
    secretKey: 'token',
    scope: 'personal',
  },
];

vi.mock('@/lib/hooks/use-secret-key-options', () => ({
  useSecretKeyOptions: () => ({ options: SECRET_OPTIONS, loaded: true }),
}));

vi.mock('@/components/ui/mcp-header-row', () => ({
  McpHeaderColumnLabels: () => null,
  McpHeaderRowFields: ({
    row,
    secretOptions,
    onChange,
  }: {
    row: McpHeaderRow;
    secretOptions: SecretKeyOption[];
    onChange: (updates: Partial<McpHeaderRow>) => void;
  }) => (
    <div data-testid="header-row">
      {row.serverName ?? 'all'}: {secretOptions.length} secrets
      <button type="button" onClick={() => onChange({ serverName: undefined })}>
        Move to all
      </button>
    </div>
  ),
}));

function renderFields(
  props: Partial<Parameters<typeof ChatMcpHeaderFields>[0]> = {},
) {
  const onUpdateRow = vi.fn();
  render(
    <ChatMcpHeaderFields
      rows={[]}
      nameOptionsFor={() => []}
      namesForServer={() => []}
      canAddRow
      errors={{}}
      serverNames={['github']}
      effectiveCount={0}
      onAddRow={vi.fn()}
      onUpdateRow={onUpdateRow}
      onRemoveRow={vi.fn()}
      {...props}
    />,
  );
  return { onUpdateRow };
}

describe('ChatMcpHeaderFields', () => {
  it('shows the effective count and Fix to send while collapsed', () => {
    renderFields({ effectiveCount: 2, hasErrors: true });

    expect(
      screen.getByTestId('chat-mcp-header-effective-count'),
    ).toHaveTextContent('2 effective');
    expect(screen.getByText('Fix to send')).toBeInTheDocument();
    expect(screen.queryByTestId('header-row')).not.toBeInTheDocument();
  });

  it('offers personal secrets only on rows for one server', () => {
    renderFields({
      rows: [createMcpHeaderRow(), createMcpHeaderRow('github')],
    });
    fireEvent.click(
      screen.getByRole('button', { name: /MCP header overrides/ }),
    );

    const rows = screen.getAllByTestId('header-row');
    expect(rows[0]).toHaveTextContent('all: 1 secrets');
    expect(rows[1]).toHaveTextContent('github: 2 secrets');
  });

  it('clears a personal secret when the row moves to All MCP servers', () => {
    const row = {
      ...createMcpHeaderRow('github'),
      name: 'Authorization',
      secretName: 'u-0123456789abcdef-mine',
      secretKey: 'token',
    };
    const { onUpdateRow } = renderFields({ rows: [row] });
    fireEvent.click(
      screen.getByRole('button', { name: /MCP header overrides/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move to all' }));

    expect(onUpdateRow).toHaveBeenCalledWith(row.id, {
      serverName: undefined,
      secretName: '',
      secretKey: '',
    });
  });
});
