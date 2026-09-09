'use client';

import { Info } from '@/components/icons';
import {
  Combobox,
  ComboboxAnchor,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const ALIAS_TOOLTIP_TEXT =
  'Use this as an alternative name, useful when you need to deploy this same resources with different name in another namespace.';

interface AliasFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly options: readonly string[];
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly error?: string;
}

export function AliasField({
  value,
  onChange,
  onBlur,
  options,
  disabled,
  invalid,
  error,
}: AliasFieldProps) {
  return (
    <FieldSet className="gap-2">
      <FieldTitle className="flex items-center gap-1.5">
        Alias
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="What is an alias?"
              className="text-fg-secondary hover:text-fg-primary">
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            {ALIAS_TOOLTIP_TEXT}
          </TooltipContent>
        </Tooltip>
      </FieldTitle>
      <Combobox
        items={options}
        value={value || null}
        onValueChange={(next: string | null) => onChange(next ?? '')}
        filter={(item: string, query: string) =>
          item.toLowerCase().includes(query.toLowerCase())
        }
        disabled={disabled}>
        <ComboboxAnchor>
          <InputGroup>
            <ComboboxInput
              variant="inline"
              placeholder="e.g., github-mcp"
              disabled={disabled}
              aria-invalid={invalid}
              onBlur={onBlur}
            />
            <InputGroupAddon align="inline-end">
              <ComboboxClear />
              <ComboboxTrigger />
            </InputGroupAddon>
          </InputGroup>
        </ComboboxAnchor>
        <ComboboxContent>
          <ComboboxEmpty>No existing configurations</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>
        Shown instead of the name in lists. Pick from existing names.
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}
