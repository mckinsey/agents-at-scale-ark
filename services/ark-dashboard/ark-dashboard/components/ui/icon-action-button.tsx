'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface IconActionButtonProps {
  label: string;
  tooltip?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function IconActionButton({
  label,
  tooltip,
  onClick,
  disabled,
  className,
  children,
}: Readonly<IconActionButtonProps>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
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
