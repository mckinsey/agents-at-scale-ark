'use client';

import { Celebration } from '@/components/icons';
import { DialogDescription } from '@/components/ui/dialog';

import { OnboardingDialog } from './onboarding-dialog';

interface PostTourDialogProps {
  open: boolean;
  onCreateAgent: () => void;
  onDismiss: () => void;
}

export function PostTourDialog({
  open,
  onCreateAgent,
  onDismiss,
}: Readonly<PostTourDialogProps>) {
  return (
    <OnboardingDialog
      open={open}
      icon={<Celebration />}
      title="Tour complete"
      confirmLabel="Create my first agent"
      dismissLabel="Maybe later"
      onConfirm={onCreateAgent}
      onDismiss={onDismiss}>
      <DialogDescription className="text-center">
        Great job! You&apos;ve seen how Ark works. Now, let&apos;s get your
        first AI agent up and running.
      </DialogDescription>
    </OnboardingDialog>
  );
}
