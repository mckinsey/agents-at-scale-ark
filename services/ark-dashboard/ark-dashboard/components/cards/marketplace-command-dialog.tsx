'use client';

import copyToClipboard from 'copy-to-clipboard';
import { toast } from 'sonner';

import { ContentCopy, Info, Terminal } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShell } from '@/components/ui/icon-shell';

export interface MarketplaceCommand {
  helmCommand?: string;
  arkCommand?: string;
  name?: string;
}

interface CommandBlockProps {
  readonly label: string;
  readonly command: string;
  readonly onCopy: (command: string) => void;
}

function CommandBlock({ label, command, onCopy }: Readonly<CommandBlockProps>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-fg-primary label-regular-primary">{label}</p>
      <div className="flex items-start gap-2">
        <code className="bg-surface-bg-tertiary text-fg-primary paragraph-code-text flex-1 px-3 py-2 break-all">
          {command}
        </code>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Copy ${label} command`}
          onClick={() => onCopy(command)}>
          <IconShell size="sm" variant="secondary">
            <ContentCopy />
          </IconShell>
        </Button>
      </div>
    </div>
  );
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
            <IconShell size="sm" variant="secondary">
              <Terminal />
            </IconShell>
            {verb} {command.name || itemName}
          </DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {command.arkCommand && (
            <CommandBlock
              label="Using Ark CLI (Recommended)"
              command={command.arkCommand}
              onCopy={handleCopy}
            />
          )}

          {command.helmCommand && (
            <CommandBlock
              label="Using Helm directly"
              command={command.helmCommand}
              onCopy={handleCopy}
            />
          )}

          <div className="bg-surface-bg-secondary flex items-start gap-2 p-3">
            <IconShell size="sm" variant="secondary">
              <Info />
            </IconShell>
            <p className="text-fg-secondary paragraph-small-primary">
              Make sure you have kubectl configured to the correct cluster
              before running these commands.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
