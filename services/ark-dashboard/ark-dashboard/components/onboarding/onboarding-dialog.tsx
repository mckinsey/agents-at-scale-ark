'use client';

import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShell } from '@/components/ui/icon-shell';

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

export function OnboardingDialog({
  open,
  onOpenChange,
  icon,
  title,
  children,
  footer,
}: Readonly<OnboardingDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="content-center gap-8 p-12 sm:min-h-[28rem] sm:max-w-[38.5rem]">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-2 flex size-12 items-center justify-center">
            <IconShell size="lg" className="text-fg-primary">
              {icon}
            </IconShell>
          </div>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {children}

        <DialogFooter className="sm:justify-center">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
