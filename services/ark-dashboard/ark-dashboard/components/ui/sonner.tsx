'use client';

import React, { memo, useEffect, useState } from 'react';
import {
  type ExternalToast,
  Toaster as Sonner,
  type ToastT,
  type ToasterProps,
  toast as sonnerToast,
} from 'sonner';

import { cn } from '../../lib/utils';
import { Cancel } from '../icons/Cancel';
import { CheckCircle } from '../icons/CheckCircle';
import { Close } from '../icons/Close';
import { ErrorIcon } from '../icons/ErrorIcon';
import { Info } from '../icons/Info';
import { PlaylistAddCheck } from '../icons/PlaylistAddCheck';
import { Button } from './button';

type ToastType = NonNullable<ToastT['type']>;

export interface ToastOptions extends Omit<ExternalToast, 'action' | 'cancel'> {
  // Action button - user provides JSX component
  readonly action?: React.ReactNode;
  // Cancel button - user provides JSX component
  // If not provided, default close button is used
  readonly cancel?: React.ReactNode;
}

interface ToastProps {
  readonly id: string | number;
  readonly message: string;
  readonly type: ToastType;
  readonly options?: ToastOptions;
}

const toastTypeConfig = {
  success: {
    borderClass: 'border-l-[var(--border-status-success)]',
    iconClass: 'text-status-success',
    iconName: 'check_circle',
  },
  error: {
    borderClass: 'border-l-[var(--border-status-error)]',
    iconClass: 'text-status-error',
    iconName: 'cancel',
  },
  warning: {
    borderClass: 'border-l-[var(--border-status-warning)]',
    iconClass: 'text-status-warning',
    iconName: 'error',
  },
  info: {
    borderClass: 'border-l-[var(--border-status-focus)]',
    iconClass: 'text-status-information',
    iconName: 'info',
  },
  default: {
    borderClass: 'border-l-[var(--border-primary)]',
    iconClass: 'text-fill-active',
    iconName: 'playlist_add_check',
  },
} as const;

type ToastConfigKey = keyof typeof toastTypeConfig;

const getToastConfig = (type: ToastType) => {
  if (type in toastTypeConfig) {
    return toastTypeConfig[type as ToastConfigKey];
  }

  return toastTypeConfig.info;
};

const getDefaultIcon = (config: ReturnType<typeof getToastConfig>) => {
  const iconClassName = cn('size-6', config.iconClass);

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    check_circle: CheckCircle,
    cancel: Cancel,
    error: ErrorIcon,
    info: Info,
    playlist_add_check: PlaylistAddCheck,
  };

  const IconComponent = iconMap[config.iconName] || Info;

  return <IconComponent className={iconClassName} />;
};

function getCancelComponent(
  cancel: ToastOptions['cancel'],
  id: string | number,
): React.ReactNode {
  if (cancel) {
    return cancel;
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => sonnerToast.dismiss(id)}
      aria-label="Close toast">
      <Close className="text-fill-active size-4" />
    </Button>
  );
}

const Toast = memo(function Toast({ id, message, type, options }: ToastProps) {
  const { action, cancel, className, icon, ...restOptions } = options || {};

  const config = getToastConfig(type);
  const defaultIcon = getDefaultIcon(config);
  const displayIcon = icon || defaultIcon;

  const cancelComponent = getCancelComponent(cancel, id);

  return (
    <div
      className={cn(
        'bg-fill-onsurface-ui-3 shadow-elevation-2 flex h-[44px] items-center gap-2 border-l-4 py-2 pr-3 pl-4',
        config.borderClass,
        className,
      )}
      {...(restOptions.testId && { 'data-testid': restOptions.testId })}>
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center">{displayIcon}</div>

        <div className="flex flex-1 items-center">
          <p className="paragraph-regular-primary text-fg-secondary">
            {message}
          </p>
          {action}
        </div>
      </div>

      {cancelComponent}
    </div>
  );
});

function createToast(type: ToastType) {
  return (message: string, options?: ToastOptions) => {
    // Extract action and cancel from options to prevent Sonner from rendering them separately
    const {
      action: _action,
      cancel: _cancel,
      ...sonnerOptions
    } = options || {};

    return sonnerToast.custom(
      id => <Toast id={id} message={message} type={type} options={options} />,
      sonnerOptions,
    );
  };
}

// Extend sonnerToast with custom toast methods
const toast = Object.assign(sonnerToast, {
  success: createToast('success'),
  error: createToast('error'),
  warning: createToast('warning'),
  info: createToast('info'),
  default: createToast('default'),
});

function useThemeValue(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') {
      return 'light';
    }

    return document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const observer = new MutationObserver(() => {
      setTheme(
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      );
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeValue();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      {...props}
    />
  );
};

export { Toaster, toast };
