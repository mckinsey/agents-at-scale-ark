import { render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { A2AEditor } from '@/components/editors/a2a-editor';
import { McpServerFields } from '@/components/forms/mcp-forms/mcp-server-fields';
import {
  type FormValues,
  useHeaderRows,
} from '@/components/forms/mcp-forms/utils';
import { useCustomHeaderRows } from '@/components/forms/shared/custom-header-rows';
import { CustomHeadersField } from '@/components/forms/shared/custom-headers-field';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(() => ({
    data: [],
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', readOnlyMode: false }),
}));

vi.mock('@/components/forms/mcp-forms/mcp-url-field', () => ({
  McpUrlField: () => null,
}));

vi.mock('@/components/forms/shared/create-resource-dialog', () => ({
  CreateResourceButton: () => null,
}));

function McpHarness() {
  const form = useForm<FormValues>();
  const headerRows = useHeaderRows();
  return (
    <McpServerFields
      form={form}
      headerRows={headerRows}
      urlState={{ kind: 'create' }}
    />
  );
}

function CustomHeadersHarness() {
  const headerRows = useCustomHeaderRows([]);
  return <CustomHeadersField headerRows={headerRows} addLabel="Add header" />;
}

function expectSharedDefaultOnly() {
  const calls = vi.mocked(useGetAllSecrets).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  for (const args of calls) {
    expect(args).toEqual([]);
  }
}

describe('secret pickers outside the Secrets page', () => {
  beforeEach(() => {
    vi.mocked(useGetAllSecrets).mockClear();
  });

  it('MCP server headers list only shared secrets', () => {
    render(<McpHarness />);
    expectSharedDefaultOnly();
  });

  it('agent and model custom headers list only shared secrets', () => {
    render(<CustomHeadersHarness />);
    expectSharedDefaultOnly();
  });

  it('A2A server headers list only shared secrets', () => {
    render(
      <A2AEditor
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        namespace="default"
      />,
    );
    expectSharedDefaultOnly();
  });
});
