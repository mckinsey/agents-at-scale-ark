'use client';

import copyToClipboard from 'copy-to-clipboard';
import { Copy, Terminal } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface MarketplaceCommand {
  helmCommand?: string;
  arkCommand?: string;
  name?: string;
}

export function MarketplaceCommandDialog({
  open,
  onOpenChange,
  command,
  itemName,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command: MarketplaceCommand;
  itemName: string;
  action: 'install' | 'uninstall';
}) {
  const verb = action === 'install' ? 'Install' : 'Uninstall';
  const commandCount = [command.arkCommand, command.helmCommand].filter(
    Boolean,
  ).length;
  const intro =
    commandCount > 1
      ? `Run one of these commands in your terminal to ${action} the marketplace item:`
      : `Run this command in your terminal to ${action} the marketplace item:`;

  const handleCopy = (text: string) => {
    if (copyToClipboard(text)) {
      toast.success('Command copied to clipboard');
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {verb} {command.name || itemName}
          </DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {command.arkCommand && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Using Ark CLI (Recommended)
              </label>
              <div className="flex items-center gap-2">
                <code className="bg-muted flex-1 rounded-md px-3 py-2 text-sm">
                  {command.arkCommand}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(command.arkCommand!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {command.helmCommand && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Using Helm directly</label>
              <div className="flex items-center gap-2">
                <code className="bg-muted flex-1 rounded-md px-3 py-2 text-sm break-all">
                  {command.helmCommand}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(command.helmCommand!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 Make sure you have kubectl configured to the correct cluster
              before running these commands.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
