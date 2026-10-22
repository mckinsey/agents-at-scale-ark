import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  buildCustomHeader,
  mapCustomHeadersToRows,
  normalizeCustomHeaders,
  useCustomHeaderRows,
  validateCustomHeaders,
} from '@/components/forms/shared/custom-header-rows';
import { CustomHeadersField } from '@/components/forms/shared/custom-headers-field';
import type { AgentHeader } from '@/lib/services';

vi.mock('@/lib/hooks/use-secret-key-options', () => ({
  useSecretKeyOptions: () => ({ options: [], loaded: true }),
}));

vi.mock('@/components/ui/mcp-header-row', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/ui/mcp-header-row')>()),
  McpHeaderRowFields: ({ row }: { row: { name: string } }) => (
    <div data-testid="header-row">{row.name}</div>
  ),
}));

const direct: AgentHeader = { name: 'X-Direct', value: { value: 'v' } };
const secret: AgentHeader = {
  name: 'X-Secret',
  value: { valueFrom: { secretKeyRef: { name: 'creds', key: 'api-key' } } },
};
const configMap: AgentHeader = {
  name: 'X-Tenant',
  value: { valueFrom: { configMapKeyRef: { name: 'cfg', key: 'tenant' } } },
};

describe('custom header rows', () => {
  it('round-trips direct and secret headers and keeps the secret key', () => {
    const rows = mapCustomHeadersToRows([direct, secret, configMap]);
    expect(rows).toHaveLength(2);
    expect(rows.map(buildCustomHeader)).toEqual([direct, secret]);
  });

  it('returns one empty row when there are no editable headers', () => {
    expect(mapCustomHeadersToRows([configMap])).toEqual([
      expect.objectContaining({ name: '', value: '' }),
    ]);
  });

  it('defaults a secret header to the token key', () => {
    expect(
      buildCustomHeader({ key: 'a', name: ' X ', type: 'secret', value: 's' }),
    ).toEqual({
      name: 'X',
      value: { valueFrom: { secretKeyRef: { name: 's', key: 'token' } } },
    });
  });

  it('rejects names that clash case-insensitively, including read-only ones', () => {
    const result = validateCustomHeaders(
      [
        { key: 'a', name: 'x-tenant', type: 'direct', value: '1' },
        { key: 'b', name: 'X-Dup', type: 'direct', value: '1' },
        { key: 'c', name: 'x-dup', type: 'direct', value: '2' },
      ],
      [configMap],
    );
    expect(result.hasErrors).toBe(true);
    expect(Object.keys(result.errors)).toEqual(['a', 'c']);
  });

  it('appends read-only headers to the payload', () => {
    expect(normalizeCustomHeaders([configMap, direct])).toEqual([
      direct,
      configMap,
    ]);
  });

  it('loads, validates and serializes through the hook', () => {
    const { result } = renderHook(() => useCustomHeaderRows([secret]));
    expect(result.current.toPayload()).toEqual([secret]);

    act(() => result.current.load([direct, configMap]));
    expect(result.current.readOnlyHeaders).toEqual([configMap]);
    expect(result.current.validate()).toEqual([direct, configMap]);

    act(() => result.current.updateRow(0, { value: '' }));
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.headerErrors).not.toEqual({});
  });
});

describe('CustomHeadersField', () => {
  function Harness() {
    const headerRows = useCustomHeaderRows([direct, configMap]);
    return <CustomHeadersField headerRows={headerRows} addLabel="Add it" />;
  }

  it('renders only editable headers and adds rows', async () => {
    render(<Harness />);
    expect(screen.getAllByTestId('header-row')).toHaveLength(1);
    expect(screen.queryByText('X-Tenant')).not.toBeInTheDocument();
    expect(screen.getByText('1 header')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add it' }));
    expect(screen.getAllByTestId('header-row')).toHaveLength(2);
  });
});
