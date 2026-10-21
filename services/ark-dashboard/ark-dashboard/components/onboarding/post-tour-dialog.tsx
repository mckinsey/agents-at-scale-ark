'use client';

import { Celebration, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
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
      onOpenChange={isOpen => {
        if (!isOpen) onDismiss();
      }}
      icon={<Celebration />}
      title="Tour complete"
      footer={
        <>
          <Button variant="outline" onClick={onDismiss}>
            Maybe later
          </Button>
          <Button onClick={onCreateAgent}>
            Create my first agent
            <ChevronRight className="size-4" />
          </Button>
        </>
      }>
      <DialogDescription className="text-center">
        Great job! You&apos;ve seen how Ark works. Now, let&apos;s get your
        first AI agent up and running.
      </DialogDescription>
    </OnboardingDialog>
  );
}
