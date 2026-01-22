'use client';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';

interface DeleteWorkflowTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  onConfirm: () => void;
}

export function DeleteWorkflowTemplateDialog({
  open,
  onOpenChange,
  templateName,
  onConfirm,
}: DeleteWorkflowTemplateDialogProps) {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Workflow Template"
      description={`Are you sure you want to delete workflow template "${templateName}"? This action cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      onConfirm={onConfirm}
      variant="destructive"
    />
  );
}
