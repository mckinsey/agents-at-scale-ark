'use client';

import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { useTrackClick } from '@/lib/analytics/hooks';

import type { buttonVariants } from './button';
import { Button } from './button';

interface TrackedButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  trackingEvent: string;
  trackingProperties?: Record<string, unknown>;
}

function TrackedButton({
  trackingEvent,
  trackingProperties,
  onClick,
  ...props
}: TrackedButtonProps) {
  const trackClick = useTrackClick(trackingEvent, trackingProperties);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    trackClick();
    onClick?.(e);
  };

  return <Button {...props} onClick={handleClick} />;
}

export { TrackedButton };
