'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Control } from 'react-hook-form';

import { SecretScopeBadge } from '@/components/common/secret-scope-badge';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { SecretScope } from '@/lib/services/secrets';
import { cn } from '@/lib/utils';

import type { SecretFormValues } from './types';

const SHARED_DESCRIPTION =
  'Everyone with access to this namespace can see it in Ark and use it in any resource.';
const PERSONAL_DESCRIPTION =
  'Only you can see it in Ark. It can be used only in the MCP server overrides of a query.';

const SCOPE_OPTIONS: readonly {
  value: SecretScope;
  label: string;
  description: string;
}[] = [
  { value: 'shared', label: 'Shared', description: SHARED_DESCRIPTION },
  { value: 'personal', label: 'Personal', description: PERSONAL_DESCRIPTION },
];

interface FormSecretScopeFieldProps {
  readonly control: Control<SecretFormValues>;
  readonly disabled?: boolean;
}

export function FormSecretScopeField({
  control,
  disabled,
}: FormSecretScopeFieldProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;

  return (
    <FormField
      control={control}
      name="scope"
      render={({ field }) => (
        <div className="flex flex-col gap-2">
          <FieldTitle id={titleId} className={cn(disabled && 'opacity-50')}>
            Scope
          </FieldTitle>
          <RadioGroup
            aria-labelledby={titleId}
            value={field.value}
            onValueChange={field.onChange}
            disabled={disabled}
            className="gap-2">
            {SCOPE_OPTIONS.map(option => {
              const itemId = `${baseId}-${option.value}`;
              const descriptionId = `${itemId}-description`;
              return (
                <div
                  key={option.value}
                  className={cn(
                    'flex items-start gap-2',
                    disabled && 'opacity-50',
                  )}>
                  <RadioGroupItem
                    id={itemId}
                    value={option.value}
                    aria-describedby={descriptionId}
                    className="mt-px"
                  />
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor={itemId}>{option.label}</FieldLabel>
                    <FieldDescription id={descriptionId}>
                      {option.description}
                    </FieldDescription>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        </div>
      )}
    />
  );
}

interface SecretScopeSummaryProps {
  readonly scope: SecretScope;
  readonly secretName: string;
  readonly displayName: string;
  readonly canMakeShared: boolean;
  readonly hasUnsavedChanges: boolean;
  readonly makingShared: boolean;
  readonly onMakeShared: () => void;
}

export function SecretScopeSummary({
  scope,
  secretName,
  displayName,
  canMakeShared,
  hasUnsavedChanges,
  makingShared,
  onMakeShared,
}: SecretScopeSummaryProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const hintId = useId();
  const groupRef = useRef<HTMLFieldSetElement>(null);
  const previousScope = useRef(scope);
  const isPersonal = scope === 'personal';

  useEffect(() => {
    if (previousScope.current === 'personal' && scope === 'shared') {
      groupRef.current?.focus();
    }
    previousScope.current = scope;
  }, [scope]);

  return (
    <FieldSet
      ref={groupRef}
      tabIndex={-1}
      className="gap-2 outline-none"
      aria-labelledby={titleId}>
      <FieldTitle id={titleId}>Scope</FieldTitle>
      <div className="flex items-center gap-3">
        <SecretScopeBadge scope={scope} />
        {isPersonal && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canMakeShared || makingShared || hasUnsavedChanges}
            aria-describedby={hasUnsavedChanges ? hintId : undefined}
            onClick={() => setConfirmOpen(true)}>
            Make shared
          </Button>
        )}
      </div>
      {isPersonal && (
        <FieldDescription>{PERSONAL_DESCRIPTION}</FieldDescription>
      )}
      {isPersonal && hasUnsavedChanges && (
        <FieldDescription id={hintId}>
          Save or discard your changes before making it shared.
        </FieldDescription>
      )}
      {isPersonal && (
        <ConfirmationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Make secret shared"
          description={`Everyone with access to this namespace will see "${displayName}" in Ark and can use it in any resource. Its name stays "${secretName}". A shared secret cannot be made personal again.`}
          confirmText="Make shared"
          cancelText="Cancel"
          variant="default"
          onConfirm={onMakeShared}
        />
      )}
    </FieldSet>
  );
}
