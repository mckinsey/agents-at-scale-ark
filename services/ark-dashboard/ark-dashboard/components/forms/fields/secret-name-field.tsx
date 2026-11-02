'use client';

import { type Ref, useId, useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { SecretScopeBadge } from '@/components/common/secret-scope-badge';
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

export type SecretNameOption = Pick<Secret, 'name'> &
  Partial<Pick<Secret, 'display_name' | 'scope'>>;

interface SecretNameFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly secrets?: readonly SecretNameOption[];
  readonly isPending?: boolean;
  readonly isError?: boolean;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly error?: string;
  readonly ref?: Ref<HTMLInputElement>;
  readonly 'aria-label'?: string;
}

function emptyMessage(isError: boolean, hasSecrets: boolean) {
  if (isError) {
    return "Couldn't load the Ark secrets. You can still type a secret name.";
  }
  return hasSecrets
    ? 'No Ark secret matches. The typed name is used as is.'
    : 'No Ark secrets in this namespace. Type a secret name.';
}

function SecretOptionLabel({
  name,
  option,
}: Readonly<{ name: string; option?: SecretNameOption }>) {
  const displayName = option?.display_name ?? name;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{displayName}</span>
        {displayName !== name && (
          <span className="text-fg-secondary label-small-primary truncate font-mono">
            {name}
          </span>
        )}
      </span>
      {option?.scope === 'personal' && (
        <SecretScopeBadge scope="personal" className="ml-auto" />
      )}
    </span>
  );
}

export function SecretNameField({
  value,
  onChange,
  onBlur,
  secrets,
  isPending = false,
  isError = false,
  placeholder = 'Select or type a secret name',
  disabled,
  invalid,
  error,
  ref,
  'aria-label': ariaLabel,
}: SecretNameFieldProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [createdNames, setCreatedNames] = useState<string[]>([]);
  const hintId = useId();
  const errorId = useId();
  const names = secrets?.map(secret => secret.name) ?? [];
  const optionsByName = new Map(secrets?.map(secret => [secret.name, secret]));
  const showMissingHint =
    !!value &&
    !focused &&
    !isPending &&
    !isError &&
    !names.includes(value) &&
    !createdNames.includes(value);
  const describedBy =
    [showMissingHint && hintId, error && errorId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Autocomplete
          items={names}
          value={value}
          onValueChange={(next, details) => {
            if (details.reason !== 'escape-key') {
              onChange(next.trim());
            }
          }}
          onOpenChange={setOpen}
          mode="list"
          openOnInputClick
          disabled={disabled}>
          <ComboboxAnchor className="min-w-0 flex-1">
            <InputGroup className={FILLED_TRIGGER_CLASS}>
              <ComboboxInput
                ref={ref}
                variant="inline"
                placeholder={placeholder}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  onBlur?.();
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && open) {
                    event.preventDefault();
                  }
                }}
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
                {emptyMessage(isError, names.length > 0)}
              </ComboboxEmpty>
            )}
            <ComboboxList>
              {(name: string) => (
                <ComboboxItem key={name} value={name} showCheckmark={false}>
                  <SecretOptionLabel
                    name={name}
                    option={optionsByName.get(name)}
                  />
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Autocomplete>
        <CreateResourceButton
          kind="secret"
          disabled={disabled}
          onCreated={name => {
            setCreatedNames(current => [...current, name]);
            onChange(name);
          }}
        />
      </div>
      {showMissingHint && (
        <p id={hintId} className="text-fg-secondary text-sm">
          Not in the list of Ark secrets for this namespace. It is referenced by
          name.
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
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
  secrets?: readonly SecretNameOption[];
  isPending?: boolean;
  isError?: boolean;
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
  isError,
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
            ref={field.ref}
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            secrets={secrets}
            isPending={isPending}
            isError={isError}
            placeholder={placeholder}
            aria-label={label}
            invalid={!!fieldState.error}
            error={fieldState.error?.message}
          />
        </FieldSet>
      )}
    />
  );
}
