'use client';

import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Button, type buttonVariants } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface IconActionButtonProps {
  label: string;
  tooltip?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  variant?: ButtonVariantProps['variant'];
  size?: ButtonVariantProps['size'];
  children: React.ReactNode;
}

export function IconActionButton({
  label,
  tooltip,
  onClick,
  disabled,
  className,
  variant = 'ghost',
  size = 'icon-sm',
  children,
}: Readonly<IconActionButtonProps>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          aria-label={label}
          disabled={disabled}
          className={className}
          onClick={onClick}>
          <IconShell size="sm" variant="secondary">
            {children}
          </IconShell>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
