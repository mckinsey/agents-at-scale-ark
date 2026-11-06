'use client';

import type { ReactNode } from 'react';

import { ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
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
  icon: ReactNode;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  dismissLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function OnboardingDialog({
  open,
  icon,
  title,
  children,
  confirmLabel,
  dismissLabel,
  onConfirm,
  onDismiss,
}: Readonly<OnboardingDialogProps>) {
  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onDismiss();
      }}>
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

        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onDismiss}>
            {dismissLabel}
          </Button>
          <Button onClick={onConfirm}>
            {confirmLabel}
            <ChevronRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
