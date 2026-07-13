'use client';

import { Celebration, ChevronRight, Close } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShell } from '@/components/ui/icon-shell';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-7 border-0 p-10 sm:max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onDismiss}
          className="absolute right-4 top-4">
          <Close className="size-5" />
        </Button>

        <DialogHeader className="items-center text-center sm:text-center">
          <div className="bg-brand-accents-qb-accent/15 mb-2 flex size-12 items-center justify-center">
            <IconShell size="lg" className="text-brand-accents-qb-accent">
              <Celebration />
            </IconShell>
          </div>
          <DialogTitle className="headings-h3-regular text-fg-primary">
            Tour complete
          </DialogTitle>
        </DialogHeader>

        <DialogDescription className="paragraph-regular-primary text-fg-secondary text-center">
          Great job! You&apos;ve seen how ARK works. Now, let&apos;s get your
          first AI agent up and running.
        </DialogDescription>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onDismiss}>
            Maybe later
          </Button>
          <Button onClick={onCreateAgent}>
            Create my first agent
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
