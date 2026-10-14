'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { CreateResourceButton } from '@/components/forms/shared/create-resource-dialog';
import {
  Autocomplete,
  ComboboxAnchor,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  FILLED_TRIGGER_CLASS,
  TRIGGER_ICON_CLASS,
} from '@/components/ui/combobox';
import { FieldError, FieldSet, FieldTitle } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import type { Secret } from '@/lib/services';

interface SecretNameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly secrets?: readonly Pick<Secret, 'name'>[];
  readonly isPending?: boolean;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly id?: string;
  readonly 'aria-label'?: string;
}

export function SecretNameField({
  value,
  onChange,
  onBlur,
  secrets,
  isPending = false,
  placeholder = 'Select or type a secret name',
  disabled,
  invalid,
  id,
  'aria-label': ariaLabel,
}: SecretNameFieldProps) {
  const names = secrets?.map(secret => secret.name) ?? [];
  const isStoredValueMissing = !!value && !isPending && !names.includes(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Autocomplete
          items={names}
          value={value}
          onValueChange={(next, details) => {
            if (details.reason !== 'escape-key') {
              onChange(next);
            }
          }}
          mode="list"
          openOnInputClick
          disabled={disabled}>
          <ComboboxAnchor className="flex-1">
            <InputGroup className={FILLED_TRIGGER_CLASS}>
              <ComboboxInput
                id={id}
                variant="inline"
                placeholder={placeholder}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-invalid={invalid}
                onBlur={onBlur}
              />
              <InputGroupAddon align="inline-end">
                <ComboboxClear aria-label="Clear secret" />
                <ComboboxTrigger className={TRIGGER_ICON_CLASS} />
              </InputGroupAddon>
            </InputGroup>
          </ComboboxAnchor>
          <ComboboxContent>
            {isPending ? (
              <Spinner size="sm" className="mx-auto my-2" />
            ) : (
              <ComboboxEmpty>
                {names.length === 0
                  ? 'No Ark secrets in this namespace. Type a secret name.'
                  : 'No Ark secret matches. The typed name is used as is.'}
              </ComboboxEmpty>
            )}
            <ComboboxList>
              {(name: string) => (
                <ComboboxItem key={name} value={name} showCheckmark={false}>
                  {name}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Autocomplete>
        <CreateResourceButton kind="secret" onCreated={onChange} />
      </div>
      {isStoredValueMissing && (
        <p className="text-fg-secondary text-sm">
          Not in the list of Ark secrets for this namespace. It is referenced by
          name.
        </p>
      )}
    </div>
  );
}

export interface FormSecretNameFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  secrets?: readonly Pick<Secret, 'name'>[];
  isPending?: boolean;
  placeholder?: string;
}

export function FormSecretNameField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  secrets,
  isPending,
  placeholder,
}: Readonly<FormSecretNameFieldProps<TFieldValues, TName>>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>{label}</FieldTitle>
          <SecretNameField
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            secrets={secrets}
            isPending={isPending}
            placeholder={placeholder}
            aria-label={label}
            invalid={!!fieldState.error}
          />
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldSet>
      )}
    />
  );
}
