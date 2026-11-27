import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { McpHeaderOverridesEditor } from '@/components/ui/mcp-header-overrides-editor';
import {
  type McpHeaderRow,
  createMcpHeaderRow,
} from '@/lib/utils/mcp-header-overrides';

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/hooks/use-secret-key-options', () => ({
  useSecretKeyOptions: () => ({ options: [], loaded: true }),
  secretOptionValue: (name: string, key: string) => `${name}/${key}`,
}));

vi.mock('@/components/ui/mcp-header-row', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/ui/mcp-header-row')>();
  return {
    ...actual,
    McpHeaderRowFields: ({
      row,
      nameOptions,
    }: {
      row: McpHeaderRow;
      nameOptions?: string[];
    }) => (
      <div data-testid="header-row">
        {row.serverName ?? 'all'}: {nameOptions?.join(', ')}
      </div>
    ),
  };
});

function renderEditor(
  props: Partial<Parameters<typeof McpHeaderOverridesEditor>[0]> = {},
) {
  const onAddRow = vi.fn();
  render(
    <McpHeaderOverridesEditor
      rows={[]}
      errors={{}}
      serverNames={['github']}
      headerNamesByServer={{ github: ['Authorization', 'X-Org-Id'] }}
      onAddRow={onAddRow}
      onUpdateRow={vi.fn()}
      onRemoveRow={vi.fn()}
      {...props}
    />,
  );
  return { onAddRow };
}

describe('McpHeaderOverridesEditor', () => {
  it('shows the empty state and adds a rule', () => {
    const { onAddRow } = renderEditor();

    expect(
      screen.getByText(/No header overrides are sent to MCP servers/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
  });

  it('disables Add rule when no selected server has headers', () => {
    renderEditor({ headerNamesByServer: { github: [] } });

    expect(screen.getByRole('button', { name: /Add rule/ })).toBeDisabled();
  });

  it('offers each row only the names its server has left', () => {
    renderEditor({
      rows: [
        { ...createMcpHeaderRow(), name: 'Authorization' },
        createMcpHeaderRow('github'),
      ],
    });

    const rows = screen.getAllByTestId('header-row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('github: X-Org-Id');
    expect(screen.getByText('1 header')).toBeInTheDocument();
  });
});
