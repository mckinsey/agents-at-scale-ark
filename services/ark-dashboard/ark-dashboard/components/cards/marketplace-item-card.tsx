'use client';

import type { ComponentType, SVGProps } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { MarketplaceCommandDialog } from '@/components/cards/marketplace-command-dialog';
import {
  AccountTree,
  Check,
  Dns,
  OpenInNew,
  PlayArrow,
  PlugConnect,
  SmartToy,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconShell } from '@/components/ui/icon-shell';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';
import { cn } from '@/lib/utils';

const VISIBLE_TAGS = 3;

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  className?: string;
}

interface CategoryBadge {
  readonly label: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}

function categoryBadge(item: MarketplaceItem): CategoryBadge {
  if (item.category === 'agents') {
    return { label: 'Agent', icon: SmartToy };
  }
  if (item.category === 'workflows') {
    return { label: 'Workflow', icon: AccountTree };
  }
  if (item.category === 'mcp-servers') {
    return { label: 'MCP', icon: PlugConnect };
  }
  if (item.type === 'demo') {
    return { label: 'Demo', icon: PlayArrow };
  }
  return { label: 'Service', icon: Dns };
}

export function MarketplaceItemCard({
  item,
  className,
}: MarketplaceItemCardProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
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
          setJustInstalled(true);
          toast.success(`${item.name} installed successfully`);
        }
      } else {
        // Assume success if no specific status
        setJustInstalled(true);
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

  const isInstalled = justInstalled || item.status === 'installed';
  const { label: categoryLabel, icon: CategoryIcon } = categoryBadge(item);
  const hiddenTagCount = item.tags.length - VISIBLE_TAGS;

  return (
    <TooltipProvider>
      <Card
        className={cn(
          'bg-surface-secondary flex h-full flex-col justify-between gap-4 border-0 p-5',
          className,
        )}>
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge format="pill" size="sm" variant="alternative" withIcon>
              <IconShell size="sm" variant="secondary">
                <CategoryIcon />
              </IconShell>
              {categoryLabel}
            </Badge>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-fg-primary headings-h3-regular">{item.name}</p>
            <div className="flex flex-col gap-2">
              <p className="text-fg-primary paragraph-regular-primary line-clamp-2 min-h-10">
                {item.shortDescription}
              </p>
              {item.source && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-fg-secondary paragraph-small-primary cursor-default truncate">
                      Source: {item.source}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-md">
                    <p className="break-all">{item.source}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, VISIBLE_TAGS).map(tag => (
              <Badge key={tag} format="pill" size="sm" variant="alternative">
                {tag}
              </Badge>
            ))}
            {hiddenTagCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    format="pill"
                    size="sm"
                    variant="alternative"
                    tabIndex={0}
                    aria-label={`${hiddenTagCount} more tags`}
                    className="cursor-default">
                    +{hiddenTagCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>{item.tags.slice(VISIBLE_TAGS).join(', ')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {isInstalled && item.uis && item.uis.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.uis.map(ui => (
                <Button
                  key={ui.url}
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(ui.url, '_blank')}>
                  {ui.label}
                  <IconShell size="sm" variant="secondary">
                    <OpenInNew />
                  </IconShell>
                </Button>
              ))}
            </div>
          )}

          <div className="flex w-full items-center justify-between pl-1">
            <p className="text-fg-secondary paragraph-small-primary">
              v{item.version}
            </p>

            {item.type === 'demo' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  item.repository && window.open(item.repository, '_blank')
                }
                disabled={!item.repository}>
                View
                <IconShell size="sm" variant="secondary">
                  <OpenInNew />
                </IconShell>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInstall}
                disabled={isInstalling || isInstalled}>
                {isInstalled && (
                  <>
                    Installed
                    <IconShell size="sm" variant="secondary">
                      <Check />
                    </IconShell>
                  </>
                )}
                {isInstalling && !isInstalled && (
                  <>
                    <Spinner className="mr-1 h-3 w-3" />
                    Loading...
                  </>
                )}
                {!isInstalling && !isInstalled && 'Get'}
              </Button>
            )}
          </div>
        </div>

        <MarketplaceCommandDialog
          open={showCommandDialog}
          onOpenChange={setShowCommandDialog}
          command={installCommand}
          itemName={item.name}
          action="install"
        />
      </Card>
    </TooltipProvider>
  );
}
