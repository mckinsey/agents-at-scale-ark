'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import {
  useDeleteConversationMemory,
  useDeleteQueryMemory,
  useResetMemory,
} from '@/lib/services/memory-hooks';

type DeleteConfirmationType = 'conversation' | 'query' | 'reset' | null;

type Query = {
  conversationId: string;
  queryId: string;
};

type MemoryDeleteActionsProps = {
  readonly selectedQuery?: Query;
  readonly selectedConversation?: string | null;
  readonly onSuccess?: () => void;
};

export function MemoryDeleteActions({
  selectedQuery,
  selectedConversation,
  onSuccess,
}: MemoryDeleteActionsProps) {
  const [openDialog, setOpenDialog] = useState<DeleteConfirmationType>(null);

  const deleteQueryMemory = useDeleteQueryMemory();
  const deleteConversationMemory = useDeleteConversationMemory();
  const resetMemory = useResetMemory();

  const handleOpenChange = (open: boolean) => {
    if (!open) setOpenDialog(null);
  };

  const handleDeleteQuery = () => {
    if (selectedQuery) {
      deleteQueryMemory.mutate(selectedQuery, { onSuccess });
    }
  };

  const handleDeleteConversation = () => {
    if (selectedConversation) {
      deleteConversationMemory.mutate(selectedConversation, { onSuccess });
    }
  };

  const handleResetMemory = () => {
    resetMemory.mutate(undefined, { onSuccess });
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        disabled={!selectedQuery}
        onClick={() => setOpenDialog('query')}>
        Delete selected query
      </Button>
      <Button
        variant="outline"
        disabled={!selectedConversation}
        onClick={() => setOpenDialog('conversation')}>
        Delete selected conversation
      </Button>
      <Button onClick={() => setOpenDialog('reset')}>Reset memory</Button>

      <ConfirmationDialog
        open={openDialog === 'query'}
        onOpenChange={handleOpenChange}
        title="Delete selected query"
        description={`This permanently deletes every message stored for query "${selectedQuery?.queryId}". This action cannot be undone.`}
        confirmText="Delete query"
        onConfirm={handleDeleteQuery}
        variant="destructive"
      />
      <ConfirmationDialog
        open={openDialog === 'conversation'}
        onOpenChange={handleOpenChange}
        title="Delete selected conversation"
        description={`This permanently deletes every message stored for conversation "${selectedConversation}". This action cannot be undone.`}
        confirmText="Delete conversation"
        onConfirm={handleDeleteConversation}
        variant="destructive"
      />
      <ConfirmationDialog
        open={openDialog === 'reset'}
        onOpenChange={handleOpenChange}
        title="Reset memory"
        description="This permanently deletes every message from every conversation in memory. This action cannot be undone."
        confirmText="Reset memory"
        onConfirm={handleResetMemory}
        variant="destructive"
      />
    </div>
  );
}
