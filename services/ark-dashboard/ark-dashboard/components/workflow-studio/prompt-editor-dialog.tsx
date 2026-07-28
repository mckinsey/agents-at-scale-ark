'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownEditor } from '@/components/ui/markdown-editor';

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PromptEditorDialog({
  open,
  onOpenChange,
  value,
  onChange,
  disabled = false,
}: Readonly<PromptEditorDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="prompt-editor-dialog"
        className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-4 p-6 sm:max-w-[90vw]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit prompt</DialogTitle>
          <DialogDescription>
            Compose your message in markdown. Closing the editor fills it into
            the chat.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-card focus-within:ring-ring/50 min-h-0 flex-1 overflow-hidden rounded-md border focus-within:ring-[3px]">
          <MarkdownEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            autoFocus
            placeholder="Write your prompt in markdown..."
            data-testid="prompt-editor-input"
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            data-testid="prompt-editor-done">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
