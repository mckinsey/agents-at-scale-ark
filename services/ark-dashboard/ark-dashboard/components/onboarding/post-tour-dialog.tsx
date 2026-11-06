'use client';

import { Celebration } from '@/components/icons';
import { DialogDescription } from '@/components/ui/dialog';

import { OnboardingDialog } from './onboarding-dialog';

interface PostTourDialogProps {
  open: boolean;
  readOnly?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function PostTourDialog({
  open,
  readOnly = false,
  onConfirm,
  onDismiss,
}: Readonly<PostTourDialogProps>) {
  return (
    <OnboardingDialog
      open={open}
      icon={<Celebration />}
      title="Tour complete"
      confirmLabel={readOnly ? 'Explore agents' : 'Create my first agent'}
      dismissLabel="Maybe later"
      onConfirm={onConfirm}
      onDismiss={onDismiss}>
      <DialogDescription className="text-center">
        {readOnly
          ? "Great job! You've seen how Ark works. Take a look at the agents already running in this namespace."
          : "Great job! You've seen how Ark works. Now, let's get your first AI agent up and running."}
      </DialogDescription>
    </OnboardingDialog>
  );
}
