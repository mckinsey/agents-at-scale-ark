'use client';

import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type TooltipContentProps = React.ComponentProps<typeof TooltipContent>;

interface TruncatedTooltipProps {
  label: React.ReactNode;
  children: React.ReactElement<{ ref?: React.Ref<HTMLElement> }>;
  side?: TooltipContentProps['side'];
  contentClassName?: string;
}

function mergeRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref && typeof ref === 'object') {
        (ref as React.RefObject<T | null>).current = value;
      }
    }
  };
}

export function TruncatedTooltip({
  label,
  children,
  side,
  contentClassName,
}: TruncatedTooltipProps) {
  const ref = React.useRef<HTMLElement>(null);
  const [open, setOpen] = React.useState(false);

  // Measure lazily when the tooltip wants to open (hover/focus). At that point
  // layout and web fonts are settled, so scrollWidth/clientWidth are reliable —
  // unlike a mount-time measurement, which races font loading and column sizing.
  const handleOpenChange = (next: boolean) => {
    const element = ref.current;
    setOpen(next && !!element && element.scrollWidth > element.clientWidth);
  };

  const child = React.cloneElement(children, {
    ref: mergeRefs(ref, children.props.ref),
  });

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>{child}</TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
