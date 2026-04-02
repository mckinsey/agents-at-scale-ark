'use client';

import { Bot, Check, Copy, ExternalLink, Loader2, Server, Terminal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import copyToClipboard from 'copy-to-clipboard';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';
import { cn } from '@/lib/utils';

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  className?: string;
}

export function MarketplaceItemCard({
  item,
  className,
}: MarketplaceItemCardProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [localStatus, setLocalStatus] = useState(item.status);
  const [showCommandDialog, setShowCommandDialog] = useState(false);
  const [installCommand, setInstallCommand] = useState<{
    helmCommand?: string;
    arkCommand?: string;
    name?: string;
  }>({});
  const installMutation = useInstallMarketplaceItem();

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const result = await installMutation.mutateAsync(item.id);

      // Check if we got a command back instead of a successful installation
      if (result && typeof result === 'object' && 'status' in result) {
        const data = result as Record<string, unknown>;
        if (data.status === 'command') {
          // Show command dialog
          setInstallCommand({
            helmCommand: data.helmCommand as string | undefined,
            arkCommand: data.arkCommand as string | undefined,
            name: (data.name as string | undefined) || item.name,
          });
          setShowCommandDialog(true);
        } else if (data.status === 'installed') {
          setLocalStatus('installed');
          toast.success(`${item.name} installed successfully`);
        }
      } else {
        // Assume success if no specific status
        setLocalStatus('installed');
        toast.success(`${item.name} installed successfully`);
      }
    } catch (error) {
      console.error('Installation error:', error);

      // Extract error details from APIError
      let errorMessage = 'Unknown error occurred';
      let errorDetails = '';

      if (error && typeof error === 'object' && 'data' in error) {
        // Check if it's actually a command response
        const data = error.data;
        if (typeof data === 'object' && data !== null) {
          const errorData = data as Record<string, unknown>;

          // Check if this is actually a command response, not an error
          if (errorData.status === 'command') {
            setInstallCommand({
              helmCommand: errorData.helmCommand as string,
              arkCommand: errorData.arkCommand as string,
              name: (errorData.name as string) || item.name,
            });
            setShowCommandDialog(true);
            setIsInstalling(false);
            return;
          }

          errorMessage =
            (errorData.error as string) ||
            ('message' in error && typeof error.message === 'string'
              ? error.message
              : errorMessage);
          errorDetails =
            (errorData.details as string) ||
            (errorData.instructions as string) ||
            '';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast.error(`Failed to install ${item.name}`, {
        description: errorDetails || errorMessage,
        duration: 8000,
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const getTypeIcon = (type: string) => {
    if (type === 'service') {
      return <Server className="h-4 w-4" />;
    } else if (item.category === 'agents') {
      return <Bot className="h-4 w-4" />;
    }
    return null;
  };

  return (
    <Card
      className={cn(
        'group relative flex h-full flex-col transition-all',
        className,
      )}>
      <CardHeader className="flex-none space-y-3">
        {/* Type Badge */}
        <div className="flex items-center justify-between">
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              item.type === 'service'
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-500 dark:text-blue-400'
                : item.category === 'agents'
                  ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'border-border bg-muted text-muted-foreground',
            )}>
            {getTypeIcon(item.type)}
            <span className="capitalize">
              {item.category === 'agents' ? 'Agent' : item.type}
            </span>
          </div>
        </div>

        {/* Title and Description */}
        <div>
          <CardTitle className="text-xl font-semibold">
            {item.name}
          </CardTitle>
          <CardDescription className="mt-2 line-clamp-2">
            {item.shortDescription}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Source */}
        {item.source && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs text-muted-foreground cursor-default">
                  <span>Source: </span>
                  <span className="truncate inline-block max-w-[calc(100%-60px)] align-bottom">
                    {item.source}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-md">
                <p className="break-all">{item.source}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.slice(0, 4).map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="px-2 py-0.5 text-xs">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 4 && (
              <Badge
                variant="secondary"
                className="px-2 py-0.5 text-xs">
                +{item.tags.length - 4}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-none pt-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-muted-foreground">v{item.version}</div>

          {item.type === 'demo' ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => item.repository && window.open(item.repository, '_blank')}
              disabled={!item.repository}>
              View
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleInstall}
              disabled={isInstalling || localStatus === 'installed'}>
              {localStatus === 'installed' && (
                <>
                  Installed
                  <Check className="ml-1 h-3 w-3" />
                </>
              )}
              {isInstalling && localStatus !== 'installed' && (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Loading...
                </>
              )}
              {!isInstalling && localStatus !== 'installed' && 'Get'}
            </Button>
          )}
        </div>
      </CardFooter>

      <InstallCommandDialog
        open={showCommandDialog}
        onOpenChange={setShowCommandDialog}
        installCommand={installCommand}
        itemName={item.name}
      />
    </Card>
  );
}

function InstallCommandDialog({
  open,
  onOpenChange,
  installCommand,
  itemName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installCommand: {
    helmCommand?: string;
    arkCommand?: string;
    name?: string;
  };
  itemName: string;
}) {
  const handleCopy = (text: string) => {
    const success = copyToClipboard(text);
    if (success) {
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
            Install {installCommand.name || itemName}
          </DialogTitle>
          <DialogDescription>
            Run one of these commands in your terminal to install the
            marketplace item:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {installCommand.arkCommand && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Using Ark CLI (Recommended)
              </label>
              <div className="flex items-center gap-2">
                <code className="bg-muted flex-1 rounded-md px-3 py-2 text-sm">
                  {installCommand.arkCommand}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(installCommand.arkCommand!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {installCommand.helmCommand && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Using Helm directly</label>
              <div className="flex items-center gap-2">
                <code className="bg-muted flex-1 rounded-md px-3 py-2 text-sm break-all">
                  {installCommand.helmCommand}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(installCommand.helmCommand!)}>
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
