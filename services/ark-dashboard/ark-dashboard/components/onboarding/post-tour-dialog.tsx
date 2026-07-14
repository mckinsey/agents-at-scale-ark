'use client';

import { Celebration, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DialogDescription } from '@/components/ui/dialog';
import { OnboardingDialog } from './onboarding-dialog';

interface PostTourDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAgent: () => void;
  onDismiss: () => void;
}

export function PostTourDialog({
  open,
  onOpenChange,
  onCreateAgent,
  onDismiss,
}: Readonly<PostTourDialogProps>) {
  return (
    <OnboardingDialog
      open={open}
      onOpenChange={onOpenChange}
      onClose={onDismiss}
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
      <DialogDescription className="paragraph-regular-primary text-fg-secondary text-center">
        Great job! You&apos;ve seen how ARK works. Now, let&apos;s get your first
        AI agent up and running.
      </DialogDescription>
    </OnboardingDialog>
  );
}
