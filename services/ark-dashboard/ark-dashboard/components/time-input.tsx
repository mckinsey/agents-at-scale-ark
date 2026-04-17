'use client';

import { useState } from 'react';

import { FieldDescription, FieldSet, FieldTitle } from '@/components/ui/field';
import { TimeInput } from '@/components/ui/time-input';
import { cn } from '@/lib/utils';

const fieldConfig = {
  sm: {
    label: 'label-small-primary text-fg-secondary',
    description: 'paragraph-small-primary text-fg-tertiary',
    gap: 'gap-2',
  },
  default: {
    label: 'label-regular-primary text-fg-secondary',
    description: 'paragraph-regular-primary text-fg-tertiary',
    gap: 'gap-2',
  },
  lg: {
    label: 'label-large-primary text-fg-secondary',
    description: 'paragraph-regular-primary text-fg-tertiary',
    gap: 'gap-2',
  },
} as const;

const getLabelClassName = (
  size: keyof typeof fieldConfig,
  variant: 'default' | 'inline' = 'default',
) => {
  return cn(
    fieldConfig[size].label,
    variant === 'inline' &&
      (size === 'default' || size === 'lg') &&
      'mb-[-4px]',
  );
};

// ============================================================================
// Example Components (New Format)
// ============================================================================

/**
 * All sizes in a row — default variant
 */
export function TimeInputDemo() {
  const [h1, setH1] = useState<number | null>(10);
  const [m1, setM1] = useState<number | null>(30);
  const [h2, setH2] = useState<number | null>(10);
  const [m2, setM2] = useState<number | null>(30);
  const [h3, setH3] = useState<number | null>(10);
  const [m3, setM3] = useState<number | null>(30);

  const sizes = [
    {
      label: 'Small',
      size: 'sm' as const,
      h: h1,
      m: m1,
      setH: setH1,
      setM: setM1,
    },
    {
      label: 'Default',
      size: 'default' as const,
      h: h2,
      m: m2,
      setH: setH2,
      setM: setM2,
    },
    {
      label: 'Large',
      size: 'lg' as const,
      h: h3,
      m: m3,
      setH: setH3,
      setM: setM3,
    },
  ];

  return (
    <div className="flex flex-wrap items-end gap-8">
      {sizes.map(({ label, size, h, m, setH, setM }) => {
        const cfg = fieldConfig[size];

        return (
          <FieldSet key={size} className={cfg.gap}>
            <FieldTitle className={getLabelClassName(size)}>{label}</FieldTitle>

            <TimeInput
              size={size}
              hour={h}
              minute={m}
              onHourChange={setH}
              onMinuteChange={setM}
              className="w-fit"
            />

            <FieldDescription className={cfg.description}>
              Helper text
            </FieldDescription>
          </FieldSet>
        );
      })}
    </div>
  );
}

/**
 * All sizes in a row — inline variant
 */
export function TimeInputInline() {
  const [h1, setH1] = useState<number | null>(10);
  const [m1, setM1] = useState<number | null>(30);
  const [h2, setH2] = useState<number | null>(10);
  const [m2, setM2] = useState<number | null>(30);
  const [h3, setH3] = useState<number | null>(10);
  const [m3, setM3] = useState<number | null>(30);

  const sizes = [
    {
      label: 'Small',
      size: 'sm' as const,
      h: h1,
      m: m1,
      setH: setH1,
      setM: setM1,
    },
    {
      label: 'Default',
      size: 'default' as const,
      h: h2,
      m: m2,
      setH: setH2,
      setM: setM2,
    },
    {
      label: 'Large',
      size: 'lg' as const,
      h: h3,
      m: m3,
      setH: setH3,
      setM: setM3,
    },
  ];

  return (
    <div className="flex flex-wrap items-end gap-8">
      {sizes.map(({ label, size, h, m, setH, setM }) => {
        const cfg = fieldConfig[size];

        return (
          <FieldSet key={size} className={cfg.gap}>
            <FieldTitle className={getLabelClassName(size, 'inline')}>
              {label}
            </FieldTitle>

            <TimeInput
              variant="inline"
              size={size}
              hour={h}
              minute={m}
              onHourChange={setH}
              onMinuteChange={setM}
            />

            <FieldDescription className={cfg.description}>
              Helper text
            </FieldDescription>
          </FieldSet>
        );
      })}
    </div>
  );
}

/**
 * Time input with step intervals
 */
export function TimeInputSteps() {
  const [h1, setH1] = useState<number | null>(10);
  const [m1, setM1] = useState<number | null>(30);
  const [h2, setH2] = useState<number | null>(10);
  const [m2, setM2] = useState<number | null>(30);
  const [h3, setH3] = useState<number | null>(10);
  const [m3, setM3] = useState<number | null>(30);
  const { label, description, gap } = fieldConfig.default;

  const steps = [
    {
      label: '5 minute steps',
      step: 300,
      h: h1,
      m: m1,
      setH: setH1,
      setM: setM1,
    },
    {
      label: '15 minute steps',
      step: 900,
      h: h2,
      m: m2,
      setH: setH2,
      setM: setM2,
    },
    {
      label: '30 minute steps',
      step: 1800,
      h: h3,
      m: m3,
      setH: setH3,
      setM: setM3,
    },
  ];

  return (
    <div className="space-y-6">
      {steps.map(({ label: stepLabel, step, h, m, setH, setM }) => (
        <FieldSet key={step} className={gap}>
          <FieldTitle className={label}>{stepLabel}</FieldTitle>

          <TimeInput
            step={step}
            hour={h}
            minute={m}
            onHourChange={setH}
            onMinuteChange={setM}
            className="w-fit"
          />

          <FieldDescription className={description}>
            Helper text
          </FieldDescription>
        </FieldSet>
      ))}
    </div>
  );
}

/**
 * Disabled time input
 */
export function TimeInputDisabled() {
  const { label, description, gap } = fieldConfig.default;

  return (
    <FieldSet className={gap}>
      <FieldTitle className={label}>Label</FieldTitle>
      <TimeInput hour={10} minute={30} disabled className="w-fit" />

      <FieldDescription className={description}>Helper text</FieldDescription>
    </FieldSet>
  );
}

/**
 * Validation states
 */
export function TimeInputValidation() {
  const [h1, setH1] = useState<number | null>(10);
  const [m1, setM1] = useState<number | null>(30);
  const [h2, setH2] = useState<number | null>(14);
  const [m2, setM2] = useState<number | null>(0);
  const [h3, setH3] = useState<number | null>(8);
  const [m3, setM3] = useState<number | null>(45);
  const { label, description, gap } = fieldConfig.default;

  const validations = [
    {
      label: 'Error',
      state: 'error' as const,
      h: h1,
      m: m1,
      setH: setH1,
      setM: setM1,
      desc: 'This field is required',
    },
    {
      label: 'Warning',
      state: 'warning' as const,
      h: h2,
      m: m2,
      setH: setH2,
      setM: setM2,
      desc: 'Outside business hours',
    },
    {
      label: 'Success',
      state: 'success' as const,
      h: h3,
      m: m3,
      setH: setH3,
      setM: setM3,
      desc: 'Time confirmed',
    },
  ];

  return (
    <div className="space-y-6">
      {validations.map(({ label: valLabel, state, h, m, setH, setM, desc }) => (
        <FieldSet key={state} className={gap}>
          <FieldTitle className={label}>{valLabel}</FieldTitle>

          <TimeInput
            validationState={state}
            hour={h}
            minute={m}
            onHourChange={setH}
            onMinuteChange={setM}
            className="w-fit"
          />

          <FieldDescription className={description}>{desc}</FieldDescription>
        </FieldSet>
      ))}
    </div>
  );
}

// ============================================================================
// Example Metadata
// ============================================================================

export const examples = [
  {
    name: 'TimeInputDemo',
    title: 'Default',
    description: 'All sizes — small, default, and large.',
  },
  {
    name: 'TimeInputInline',
    title: 'Inline Variant',
    description: 'All sizes — inline styling.',
  },
  {
    name: 'TimeInputSteps',
    title: 'Step Intervals',
    description: 'Time inputs with different step intervals.',
  },
  {
    name: 'TimeInputDisabled',
    title: 'Disabled',
    description: 'Disabled time input.',
  },
  {
    name: 'TimeInputValidation',
    title: 'Validation States',
    description: 'Time inputs with error, warning, and success states.',
  },
];

// ============================================================================
// Legacy Format (for backwards compatibility)
// ============================================================================

export const timeInput = {
  name: 'time-input',
  components: {
    Default: <TimeInputDemo />,
    'Inline Variant': <TimeInputInline />,
    'Step Intervals': <TimeInputSteps />,
    Disabled: <TimeInputDisabled />,
    'Validation States': <TimeInputValidation />,
  },
};
