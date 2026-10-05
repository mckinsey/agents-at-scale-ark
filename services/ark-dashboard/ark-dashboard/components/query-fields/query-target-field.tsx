'use client';

import { useMemo } from 'react';

import { INLINE_TRIGGER_STYLES } from '@/components/query-fields/inline-trigger-styles';
import {
  Combobox,
  ComboboxAnchor,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox';
import { InputGroup } from '@/components/ui/input-group';
import type { components } from '@/lib/api/generated/types';
import { cn } from '@/lib/utils';

type Target = components['schemas']['Target'];

interface AvailableTarget {
  name: string;
  type: 'agent' | 'model' | 'team' | 'tool';
}

interface TargetGroup {
  type: string;
  items: AvailableTarget[];
}

interface QueryTargetFieldProps {
  value: Target | undefined;
  onChange?: (target: Target) => void;
  availableTargets: AvailableTarget[];
  loading?: boolean;
}

const TRIGGER_STYLES = cn(
  INLINE_TRIGGER_STYLES,
  'paragraph-regular-primary text-fg-primary flex cursor-pointer items-center justify-between gap-2 data-disabled:cursor-not-allowed data-disabled:opacity-50',
  '[&_[data-slot=combobox-trigger-icon]]:transition-transform [&_[data-slot=combobox-trigger-icon]]:duration-200 data-[popup-open]:[&_[data-slot=combobox-trigger-icon]]:rotate-180',
);

function toTargetKey(target: Target): string {
  return `${target.type}:${target.name}`;
}

function isSameTarget(a: Target, b: Target): boolean {
  return a.type === b.type && a.name === b.name;
}

export function QueryTargetField({
  value,
  onChange,
  availableTargets,
  loading = false,
}: QueryTargetFieldProps) {
  const groupedTargets = useMemo(() => {
    const groups = new Map<string, AvailableTarget[]>();
    for (const target of availableTargets) {
      groups.set(target.type, [...(groups.get(target.type) ?? []), target]);
    }
    return Array.from(
      groups,
      ([type, items]): TargetGroup => ({ type, items }),
    );
  }, [availableTargets]);

  return (
    <Combobox
      items={groupedTargets}
      value={value ?? null}
      onValueChange={(next: Target | null) => {
        if (next) {
          onChange?.({ type: next.type, name: next.name });
        }
      }}
      itemToStringLabel={(target: Target) => target.name}
      isItemEqualToValue={isSameTarget}
      disabled={loading}>
      <ComboboxAnchor>
        <ComboboxTrigger className={TRIGGER_STYLES}>
          <ComboboxValue>
            {(selected: Target | null) => (
              <span
                className={cn(
                  'min-w-0 truncate',
                  !selected && 'text-fg-tertiary',
                )}>
                {loading
                  ? 'Loading...'
                  : selected
                    ? toTargetKey(selected)
                    : 'Select target'}
              </span>
            )}
          </ComboboxValue>
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxContent className="w-80">
        <InputGroup className="w-auto">
          <ComboboxInput placeholder="Filter targets..." size="sm" />
        </InputGroup>
        <ComboboxEmpty>
          {availableTargets.length === 0
            ? 'No targets available'
            : 'No targets match your filter'}
        </ComboboxEmpty>
        <ComboboxList>
          {(group: TargetGroup) => (
            <ComboboxGroup
              key={group.type}
              items={group.items}
              className="last:mb-0 last:border-b-0">
              <ComboboxLabel className="capitalize">
                {group.type}s
              </ComboboxLabel>
              <ComboboxCollection>
                {(target: AvailableTarget) => (
                  <ComboboxItem key={toTargetKey(target)} value={target}>
                    {target.name}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
