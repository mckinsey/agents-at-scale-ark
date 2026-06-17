'use client';

import type { LucideIcon } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { cn } from '@/lib/utils';

export interface BaseCardAction {
  icon: LucideIcon | React.FC<{ className?: string }>;
  label: string;
  onClick: () => void;
  variant?:
    | 'default'
    | 'accent'
    | 'destructive'
    | 'secondary'
    | 'outline'
    | 'ghost';
  className?: string;
  disabled?: boolean;
}

export interface BaseCardProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon | React.ReactElement;
  iconClassName?: string;
  actions?: BaseCardAction[];
  children?: React.ReactNode;
  className?: string;
  cardClassName?: string;
  footer?: React.ReactNode;
  onClick?: () => void;
}

export function BaseCard({
  title,
  description,
  icon: Icon,
  iconClassName,
  actions = [],
  children,
  className,
  cardClassName,
  footer,
  onClick,
}: BaseCardProps) {
  return (
    <Card
      className={cn('relative', onClick && 'cursor-pointer', cardClassName)}
      onClick={onClick}>
      <CardHeader className="flex flex-row pr-3.5">
        <CardTitle className="flex max-w-full items-center gap-2 overflow-hidden text-lg">
          {Icon &&
            (React.isValidElement(Icon) ? (
              <div className="h-5 w-5 flex-shrink-0">{Icon}</div>
            ) : typeof Icon === 'function' ? (
              <Icon className={cn('h-5 w-5 flex-shrink-0', iconClassName)} />
            ) : null)}
          <TruncatedTooltip label={title}>
            <span className="block truncate">{title}</span>
          </TruncatedTooltip>
        </CardTitle>
        {actions.length > 0 && (
          <CardAction className="ml-auto flex">
            {actions.map((action, index) => {
              const IconComponent = action.icon;
              return (
                <Button
                  key={index}
                  variant={action.variant || 'ghost'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={e => {
                    e.stopPropagation();
                    action.onClick();
                  }}
                  aria-label={action.label}
                  disabled={action.disabled}>
                  <IconComponent className={cn('h-4 w-4', action.className)} />
                </Button>
              );
            })}
          </CardAction>
        )}
      </CardHeader>
      <div
        className={cn(
          'flex h-full w-full flex-1 flex-col px-6 py-3',
          className,
        )}>
        {children}
      </div>
      {description && (
        <div className="flex h-full w-full flex-1 flex-row px-6">
          <CardDescription>{description}</CardDescription>
        </div>
      )}
      {footer && (
        <div className="flex h-full w-full flex-1 flex-row px-6">{footer}</div>
      )}
    </Card>
  );
}
