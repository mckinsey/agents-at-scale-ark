'use client';

import { Lock, Plus } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ConditionalInputRow } from '@/components/ui/conditionalInputRow';
import { FieldDescription, FieldSet, FieldTitle } from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import type { AgentHeader } from '@/lib/services';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';

import type { CustomHeaderRows } from './custom-header-rows';

function describeReadOnlyValue(header: AgentHeader): string {
  const configMapKeyRef = header.value.valueFrom?.configMapKeyRef;
  return configMapKeyRef
    ? `ConfigMap: ${configMapKeyRef.name}/${configMapKeyRef.key}`
    : 'External reference';
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
  const { data: secrets } = useGetAllSecrets();
  const {
    headers,
    headerErrors,
    readOnlyHeaders,
    updateRow,
    addRow,
    deleteRow,
    clearRowError,
  } = headerRows;

  return (
    <FieldSet className="gap-2">
      <FieldTitle>{title}</FieldTitle>
      {description && <FieldDescription>{description}</FieldDescription>}
      {readOnlyHeaders.map(header => (
        <div key={header.name} className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              variant="inline"
              value={header.name}
              aria-label={`Header ${header.name} name`}
              disabled
              readOnly
            />
          </div>
          <div className="flex-[2]">
            <Input
              variant="inline"
              value={describeReadOnlyValue(header)}
              aria-label={`Header ${header.name} value`}
              disabled
              readOnly
            />
          </div>
          <span
            className="flex size-7 shrink-0 items-center justify-center"
            title="Read-only here. Edit it in the resource YAML.">
            <IconShell size="sm" variant="secondary">
              <Lock />
            </IconShell>
          </span>
        </div>
      ))}
      {readOnlyHeaders.length > 0 && (
        <FieldDescription>
          Headers that read from a ConfigMap are read-only here and are kept
          when you save.
        </FieldDescription>
      )}
      {headers.map((row, index) => (
        <ConditionalInputRow
          key={row.key}
          data={row}
          onChange={updated => {
            updateRow(index, updated);
            clearRowError(row.key, updated);
          }}
          secrets={secrets ?? []}
          deleteRow={deleteRow}
          nameError={headerErrors[row.key]?.nameError}
          valueError={headerErrors[row.key]?.valueError}
          namePlaceholder={namePlaceholder}
          valuePlaceholder={valuePlaceholder}
        />
      ))}
      <Button
        type="button"
        onClick={addRow}
        variant="outline"
        size="icon"
        disabled={disabled}
        aria-label={addLabel}>
        <Plus />
      </Button>
    </FieldSet>
  );
}
