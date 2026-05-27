import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Close } from '../icons/close';
import { Button } from './button';
import { IconShell } from './icon-shell';

const alertVariants = cva(
  'group/alert relative w-full bg-fill-onsurface-ui-3 shadow-elevation-2 flex items-center rounded-lg',
  {
    variants: {
      layout: {
        // Modal layout: vertical card (560px max-width)
        modal: 'max-w-[560px] px-4 py-6 gap-4',
        // Long layout: horizontal banner (full width)
        long: 'p-4 gap-4',
      },
    },
    defaultVariants: {
      layout: 'modal',
    },
  },
);

function Alert({
  className,
  layout,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-layout={layout}
      role="alert"
      className={cn(alertVariants({ layout }), className)}
      {...props}
    />
  );
}

function AlertIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-icon"
      className={cn(
        'text-status-information flex size-8 shrink-0 items-center justify-center self-start',
        className,
      )}
      {...props}
    />
  );
}

function AlertContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-content"
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-3 pt-1 align-baseline first:pl-4',
        className,
      )}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="alert-title"
      className={cn(
        'headings-h4-semibold text-fg-primary',
        'group-data-[layout=long]/alert:paragraph-large-emphasised',
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="alert-description"
      className={cn('paragraph-large-primary text-fg-secondary', className)}
      {...props}
    />
  );
}

function AlertClose({ ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className="self-start"
      data-slot="alert-close"
      size="icon"
      variant="ghost">
      <IconShell variant="secondary">
        <Close className="text-[length:inherit]" />
        <span className="sr-only">Close</span>
      </IconShell>
    </Button>
  );
}

export {
  Alert,
  AlertIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
  AlertClose,
};
