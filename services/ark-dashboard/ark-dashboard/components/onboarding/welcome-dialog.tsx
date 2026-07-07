'use client';

import { ChevronRight, Rocket } from 'lucide-react';

import { Close } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShell } from '@/components/ui/icon-shell';
import { TOUR_STEPS } from './tour-steps';

interface WelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeDialog({
  open,
  onOpenChange,
  onStart,
  onSkip,
}: Readonly<WelcomeDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-7 p-10 sm:max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onSkip}
          className="absolute right-4 top-4">
          <Close className="size-5" />
        </Button>

        <DialogHeader className="items-center text-center sm:text-center">
          <div className="bg-fill-muted mb-2 flex size-12 items-center justify-center">
            <IconShell size="lg" className="text-fg-primary">
              <Rocket />
            </IconShell>
          </div>
          <DialogTitle className="headings-h3-regular text-fg-primary">
            Welcome to ARK
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <DialogDescription className="paragraph-regular-primary text-fg-secondary text-center">
            Would you like a quick tour of the ARK platform? We&apos;ll show you
            how to build agents, manage teams, and monitor your system.
          </DialogDescription>
          <div className="border-stroke-divider flex w-full items-center justify-center gap-8 border-t pt-4">
            <div className="flex flex-col items-center gap-0.5">
              <span className="paragraph-regular-emphasised-600 text-fg-primary">
                {TOUR_STEPS.length} steps
              </span>
              <span className="label-small-primary text-fg-tertiary uppercase tracking-widest">
                Total tour
              </span>
            </div>
            <div className="bg-stroke-divider h-8 w-px" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="paragraph-regular-emphasised-600 text-fg-primary">
                3 mins
              </span>
              <span className="label-small-primary text-fg-tertiary uppercase tracking-widest">
                Est. time
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
          <Button onClick={onStart}>
            Start Guided Tour
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
