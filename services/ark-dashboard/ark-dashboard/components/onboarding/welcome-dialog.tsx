'use client';

import { ChevronRight, Rocket } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DialogDescription } from '@/components/ui/dialog';
import { OnboardingDialog } from './onboarding-dialog';
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
    <OnboardingDialog
      open={open}
      onOpenChange={onOpenChange}
      onClose={onSkip}
      icon={<Rocket />}
      title="Welcome to ARK"
      footer={
        <>
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
          <Button onClick={onStart}>
            Start Guided Tour
            <ChevronRight className="size-4" />
          </Button>
        </>
      }>
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
    </OnboardingDialog>
  );
}
