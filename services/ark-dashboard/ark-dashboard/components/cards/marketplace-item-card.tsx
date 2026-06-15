'use client';

import { Bot, Check, ExternalLink, Loader2, Server } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { MarketplaceCommandDialog } from '@/components/cards/marketplace-command-dialog';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';
import { cn } from '@/lib/utils';
import { getOriginIcon } from '@/lib/utils/origin-icon';

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

  const originIcon = getOriginIcon(item.repository, 'repository');

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
          <CardTitle className="text-xl font-semibold">{item.name}</CardTitle>
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
                <div className="text-muted-foreground cursor-default text-xs">
                  <span>Source: </span>
                  <span className="inline-block max-w-[calc(100%-60px)] truncate align-bottom">
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
              <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                +{item.tags.length - 4}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-none pt-4">
        <div className="flex w-full flex-col gap-3">
          {/* UI URLs */}
          {localStatus === 'installed' && item.uis && item.uis.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.uis.map(ui => (
                <Button
                  key={ui.url}
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  onClick={() => window.open(ui.url, '_blank')}>
                  {ui.label}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              ))}
            </div>
          )}

          {/* Version and Install/View Button */}
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-x-1.5">
              <p className="text-muted-foreground text-xs">v{item.version}</p>
              <span>{originIcon}</span>
            </div>

            {item.type === 'demo' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  item.repository && window.open(item.repository, '_blank')
                }
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
        </div>
      </CardFooter>

      <MarketplaceCommandDialog
        open={showCommandDialog}
        onOpenChange={setShowCommandDialog}
        command={installCommand}
        itemName={item.name}
        action="install"
      />
    </Card>
  );
}
