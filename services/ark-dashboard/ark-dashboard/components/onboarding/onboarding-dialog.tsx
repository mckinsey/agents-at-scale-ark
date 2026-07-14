'use client';

import type { ReactNode } from 'react';

import { Close } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShell } from '@/components/ui/icon-shell';

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

export function OnboardingDialog({
  open,
  onOpenChange,
  onClose,
  icon,
  title,
  children,
  footer,
}: Readonly<OnboardingDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-7 border-0 p-10 sm:max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4">
          <Close className="size-5" />
        </Button>

        <DialogHeader className="items-center text-center sm:text-center">
          <div className="bg-fill-muted mb-2 flex size-12 items-center justify-center">
            <IconShell size="lg" className="text-fg-primary">
              {icon}
            </IconShell>
          </div>
          <DialogTitle className="headings-h3-regular text-fg-primary">
            {title}
          </DialogTitle>
        </DialogHeader>

        {children}

        <div className="flex justify-center gap-3">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}
