'use client';

import { Rocket } from '@/components/icons';
import { DialogDescription } from '@/components/ui/dialog';
import { TOUR_STEPS } from '@/lib/constants/tour-steps';

import { OnboardingDialog } from './onboarding-dialog';

interface WelcomeDialogProps {
  open: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeDialog({
  open,
  onStart,
  onSkip,
}: Readonly<WelcomeDialogProps>) {
  return (
    <OnboardingDialog
      open={open}
      icon={<Rocket />}
      title="Welcome to Ark"
      confirmLabel="Start Guided Tour"
      dismissLabel="Skip for now"
      onConfirm={onStart}
      onDismiss={onSkip}>
      <div className="flex flex-col items-center gap-4">
        <DialogDescription className="text-center">
          Would you like a quick tour of the Ark platform? We&apos;ll show you
          how to build agents, manage teams, and monitor your system.
        </DialogDescription>
        <div className="border-stroke-divider flex w-full flex-col items-center gap-0.5 border-t pt-4">
          <span className="paragraph-regular-emphasised-600 text-fg-primary">
            {TOUR_STEPS.length} steps
          </span>
          <span className="label-small-primary text-fg-tertiary tracking-widest uppercase">
            Total tour
          </span>
        </div>
      </div>
    </OnboardingDialog>
  );
}
