'use client';

import {
  HeaderRowsHeading,
  McpHeaderColumnLabels,
  McpHeaderRowFields,
} from '@/components/ui/mcp-header-row';
import { useSecretKeyOptions } from '@/lib/hooks/use-secret-key-options';
import type { McpHeaderRow } from '@/lib/utils/mcp-header-overrides';

import type { CustomHeaderRows } from './custom-header-rows';
import type { HeaderData } from './header-rows';

function toRow(header: HeaderData): McpHeaderRow {
  const isSecret = header.type === 'secret';
  return {
    id: header.key,
    name: header.name,
    source: isSecret ? 'secret' : 'value',
    value: isSecret ? '' : header.value,
    secretName: isSecret ? header.value : '',
    secretKey: isSecret ? (header.secretKey ?? '') : '',
  };
}

function toHeaderUpdate(updates: Partial<McpHeaderRow>): Partial<HeaderData> {
  if (updates.source !== undefined) {
    return {
      type: updates.source === 'secret' ? 'secret' : 'direct',
      value: '',
      secretKey: undefined,
    };
  }
  if (updates.name !== undefined) {
    return { name: updates.name };
  }
  if (updates.secretName !== undefined) {
    return { value: updates.secretName, secretKey: updates.secretKey };
  }
  return { value: updates.value ?? '' };
}

interface CustomHeadersFieldProps {
  readonly headerRows: CustomHeaderRows;
  readonly title?: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly namePlaceholder?: string;
  readonly valuePlaceholder?: string;
  readonly addLabel?: string;
}

export function CustomHeadersField({
  headerRows,
  title = 'Headers',
  description,
  disabled,
  namePlaceholder = 'e.g., Authorization',
  valuePlaceholder = 'e.g., Bearer token',
  addLabel = 'Add header',
}: CustomHeadersFieldProps) {
  const { options, loaded } = useSecretKeyOptions();
  const { headers, headerErrors, updateRow, addRow, deleteRow, clearRowError } =
    headerRows;
  const count = headers.filter(
    header => header.name.trim() || header.value.trim(),
  ).length;

  return (
    <div className="flex flex-col gap-5" data-testid="model-headers">
      <HeaderRowsHeading
        title={title}
        tooltip={description}
        count={count}
        addLabel={addLabel}
        disabled={disabled}
        onAdd={addRow}
      />

      {headers.length > 0 && (
        <div className="flex flex-col gap-2">
          <McpHeaderColumnLabels showServer={false} />
          {headers.map((header, index) => (
            <McpHeaderRowFields
              key={header.key}
              row={toRow(header)}
              showServer={false}
              secretOptions={options}
              secretsLoaded={loaded}
              error={headerErrors[header.key]}
              disabled={disabled}
              namePlaceholder={namePlaceholder}
              valuePlaceholder={valuePlaceholder}
              onChange={updates => {
                const update = toHeaderUpdate(updates);
                updateRow(index, update);
                clearRowError(header.key, update);
              }}
              onRemove={() => deleteRow(header.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
