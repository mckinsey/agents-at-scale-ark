'use client';

import type { ComponentType, SVGProps } from 'react';
import { useMemo, useState } from 'react';

import { MarketplaceCommandDialog } from '@/components/cards/marketplace-command-dialog';
import {
  AutoReadPlay,
  Check,
  Dns,
  OpenInNew,
  SaveAlt,
  SmartToy,
} from '@/components/icons';
import { MarketplaceInstallDialog } from '@/components/marketplace/marketplace-install-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconShell } from '@/components/ui/icon-shell';
import { toast } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  MarketplaceInstallState,
  MarketplaceItem,
} from '@/lib/api/generated/marketplace-types';
import { useMarketplaceInstallCapability } from '@/lib/hooks/use-marketplace-install-capability';
import {
  useMarketplaceInstallState,
  useNamespaceInstallLock,
} from '@/lib/hooks/use-marketplace-install-state';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';
import { cn } from '@/lib/utils';
import { isSafeExternalUrl, openExternalUrl } from '@/lib/utils/external-url';
import { useNamespace } from '@/providers/NamespaceProvider';

const VISIBLE_TAGS = 3;

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  className?: string;
}

interface TypeBadge {
  readonly label: string;
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

interface InstalledStateConfig {
  readonly label: string;
  readonly dotClass: string;
  readonly tooltip: string;
}

const INSTALL_STATE_CONFIG: Readonly<
  Record<Exclude<MarketplaceInstallState, 'installable'>, InstalledStateConfig>
> = {
  installing: {
    label: 'Installing…',
    dotClass: 'bg-status-information',
    tooltip: 'This install is running. It continues if you navigate away.',
  },
  installed: {
    label: 'Installed',
    dotClass: 'bg-status-success',
    tooltip:
      'To uninstall or install a new version, contact the platform team.',
  },
  failed: {
    label: 'Failed to install',
    dotClass: 'bg-status-error',
    tooltip: 'Installation failed. Contact the platform team.',
  },
  'timed-out': {
    label: 'Timed out',
    dotClass: 'bg-status-error',
    tooltip: 'The install did not finish in time. Contact the platform team.',
  },
  'platform-managed': {
    label: 'Platform managed',
    dotClass: 'bg-fg-tertiary',
    tooltip:
      'This item is installed by the platform team. Contact them to request it.',
  },
};

function InstallStatus({
  state,
}: Readonly<{ state: MarketplaceInstallState }>) {
  if (state === 'installable') {
    return null;
  }

  const config = INSTALL_STATE_CONFIG[state];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-default">
          <StatusIndicator label={config.label} dotClass={config.dotClass} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] text-pretty">
        {config.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function InstallAction({
  disabledReason,
  onClick,
}: Readonly<{ disabledReason?: string; onClick: () => void }>) {
  const button = (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={Boolean(disabledReason)}>
      <IconShell size="sm" variant="secondary">
        <SaveAlt />
      </IconShell>
      Install
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] text-pretty">
        {disabledReason}
      </TooltipContent>
    </Tooltip>
  );
}

function typeBadge(item: MarketplaceItem): TypeBadge {
  if (item.category === 'agents') {
    return { label: 'Agent', icon: SmartToy };
  }
  const label = item.type.charAt(0).toUpperCase() + item.type.slice(1);
  if (item.type === 'service') {
    return { label, icon: Dns };
  }
  if (item.type === 'demo') {
    return { label, icon: AutoReadPlay };
  }
  return { label };
}

export function MarketplaceItemCard({
  item,
  className,
}: MarketplaceItemCardProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [showCommandDialog, setShowCommandDialog] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [installCommand, setInstallCommand] = useState<{
    helmCommand?: string;
    arkCommand?: string;
    name?: string;
  }>({});
  const installMutation = useInstallMarketplaceItem();
  const installEnabled = useMarketplaceInstallCapability();
  const { state: installState } = useMarketplaceInstallState(item);
  const lock = useNamespaceInstallLock();
  const { readOnlyMode } = useNamespace();
  const lockedByOther = Boolean(lock && lock.itemId !== item.id);

  const handleInstall = async () => {
    if (readOnlyMode) {
      return;
    }
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

      toast.error(
        `Failed to install ${item.name}: ${errorDetails || errorMessage}`,
        { duration: 8000 },
      );
    } finally {
      setIsInstalling(false);
    }
  };

  const isInstalled = justInstalled || item.status === 'installed';
  const safeUis = useMemo(
    () => (item.uis ?? []).filter(ui => isSafeExternalUrl(ui.url)),
    [item.uis],
  );
  const repositoryIsSafe = isSafeExternalUrl(item.repository);
  const showUiLinks = installEnabled
    ? installState === 'installed'
    : isInstalled;
  const { label: typeLabel, icon: TypeIcon } = typeBadge(item);
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
            <Badge
              format="pill"
              size="sm"
              variant="alternative"
              withIcon={Boolean(TypeIcon)}>
              {TypeIcon && (
                <IconShell size="sm" variant="secondary">
                  <TypeIcon />
                </IconShell>
              )}
              {typeLabel}
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
          {showUiLinks && safeUis.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {safeUis.map(ui => (
                <Button
                  key={ui.url}
                  variant="secondary"
                  size="sm"
                  onClick={() => openExternalUrl(ui.url)}>
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

            {installEnabled ? (
              installState === 'installable' ? (
                <InstallAction
                  disabledReason={
                    readOnlyMode
                      ? 'You do not have permission to install in this namespace.'
                      : lockedByOther && lock
                        ? `Installing ${lock.itemName}. One install runs at a time in a namespace.`
                        : undefined
                  }
                  onClick={() => setShowInstallDialog(true)}
                />
              ) : (
                <InstallStatus state={installState} />
              )
            ) : item.type === 'demo' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openExternalUrl(item.repository)}
                disabled={!repositoryIsSafe}>
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
                disabled={isInstalling || isInstalled || readOnlyMode}>
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

        {installEnabled && (
          <MarketplaceInstallDialog
            item={item}
            open={showInstallDialog}
            onOpenChange={setShowInstallDialog}
          />
        )}

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
