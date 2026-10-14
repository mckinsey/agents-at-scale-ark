'use client';

import { memo, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { MarketplaceCommandDialog } from '@/components/cards/marketplace-command-dialog';
import { Check, Dns, OpenInNew, SaveAlt, SmartToy } from '@/components/icons';
import { MarketplaceInstallDialog } from '@/components/marketplace/marketplace-install-dialog';
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
import { IconShell } from '@/components/ui/icon-shell';
import { Spinner } from '@/components/ui/spinner';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  Tooltip,
  TooltipContent,
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
import { getOriginIcon } from '@/lib/utils/origin-icon';
import { useNamespace } from '@/providers/NamespaceProvider';

interface MarketplaceItemCardProps {
  readonly item: MarketplaceItem;
  readonly className?: string;
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
  'timed-out': {
    label: 'Timed out',
    dotClass: 'bg-status-error',
    tooltip: 'The install did not finish in time. Contact the platform team.',
  },
  installed: {
    label: 'Installed',
    dotClass: 'bg-status-success',
    tooltip: 'Contact the platform team to upgrade or uninstall.',
  },
  failed: {
    label: 'Failed to install',
    dotClass: 'bg-status-error',
    tooltip: 'Installation failed. Contact the platform team.',
  },
  'platform-managed': {
    label: 'Platform managed',
    dotClass: 'bg-fg-tertiary',
    tooltip: 'Only the platform team can install this.',
  },
};

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
      <IconShell size="sm">
        <SaveAlt />
      </IconShell>
      Install
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  // QBDS forbids attaching a tooltip to a disabled element, so the trigger is a
  // focusable wrapper rather than the button itself.
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

function TypeIcon({ item }: Readonly<{ item: MarketplaceItem }>) {
  if (item.category === 'agents') {
    return (
      <IconShell size="sm">
        <SmartToy />
      </IconShell>
    );
  }

  if (item.type === 'service') {
    return (
      <IconShell size="sm">
        <Dns />
      </IconShell>
    );
  }

  return null;
}

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

function MarketplaceItemCardComponent({
  item,
  className,
}: Readonly<MarketplaceItemCardProps>) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installedByMutation, setInstalledByMutation] = useState(false);
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

  const handleGet = async () => {
    if (readOnlyMode) {
      return;
    }
    setIsInstalling(true);
    try {
      const result = await installMutation.mutateAsync(item.id);

      if (result && typeof result === 'object' && 'status' in result) {
        const data = result as Record<string, unknown>;
        if (data.status === 'command') {
          setInstallCommand({
            helmCommand: data.helmCommand as string | undefined,
            arkCommand: data.arkCommand as string | undefined,
            name: (data.name as string | undefined) || item.name,
          });
          setShowCommandDialog(true);
        } else if (data.status === 'installed') {
          setInstalledByMutation(true);
          toast.success(`${item.name} installed successfully`);
        }
      } else {
        setInstalledByMutation(true);
        toast.success(`${item.name} installed successfully`);
      }
    } catch (error) {
      console.error('Installation error:', error);

      let errorMessage = 'Unknown error occurred';
      let errorDetails = '';

      if (error && typeof error === 'object' && 'data' in error) {
        const data = error.data;
        if (typeof data === 'object' && data !== null) {
          const errorData = data as Record<string, unknown>;

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

  const safeUis = useMemo(
    () => (item.uis ?? []).filter(ui => isSafeExternalUrl(ui.url)),
    [item.uis],
  );
  const repositoryIsSafe = isSafeExternalUrl(item.repository);

  const legacyInstalled = installedByMutation || item.status === 'installed';
  const showUiLinks = installEnabled
    ? installState === 'installed'
    : legacyInstalled;

  const originIcon = getOriginIcon(item.repository, 'repository');
  const typeLabel = item.category === 'agents' ? 'Agent' : item.type;

  return (
    <Card
      className={cn(
        'group relative flex h-full flex-col transition-all',
        className,
      )}>
      <CardHeader className="flex-none space-y-3">
        <div className="flex items-center justify-between">
          <Badge
            variant={
              item.category === 'agents' ? 'brand-accent' : 'alternative'
            }
            size="sm"
            withIcon
            outline>
            <TypeIcon item={item} />
            <span className="capitalize">{typeLabel}</span>
          </Badge>
        </div>

        <div>
          <CardTitle className="headings-h3-semibold">{item.name}</CardTitle>
          <CardDescription className="paragraph-small-primary mt-2 line-clamp-2">
            {item.shortDescription}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {item.source && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="label-small-primary text-fg-secondary cursor-default">
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
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.slice(0, 4).map(tag => (
              <Badge key={tag} variant="alternative" size="sm">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 4 && (
              <Badge variant="alternative" size="sm">
                +{item.tags.length - 4}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-none pt-4">
        <div className="flex w-full flex-col gap-3">
          {showUiLinks && safeUis.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {safeUis.map(ui => (
                <Button
                  key={ui.url}
                  variant="secondary"
                  size="sm"
                  onClick={() => openExternalUrl(ui.url)}>
                  {ui.label}
                  <IconShell size="sm">
                    <OpenInNew />
                  </IconShell>
                </Button>
              ))}
            </div>
          )}

          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-x-1.5">
              <p className="label-small-primary text-fg-secondary">
                v{item.version}
              </p>
              <span>{originIcon}</span>
            </div>

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
                <IconShell size="sm">
                  <OpenInNew />
                </IconShell>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGet}
                disabled={isInstalling || legacyInstalled || readOnlyMode}>
                {legacyInstalled && (
                  <>
                    Installed
                    <IconShell size="sm">
                      <Check />
                    </IconShell>
                  </>
                )}
                {isInstalling && !legacyInstalled && (
                  <>
                    <Spinner size="sm" />
                    Loading...
                  </>
                )}
                {!isInstalling && !legacyInstalled && 'Get'}
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

      {installEnabled && (
        <MarketplaceInstallDialog
          item={item}
          open={showInstallDialog}
          onOpenChange={setShowInstallDialog}
        />
      )}
    </Card>
  );
}

export const MarketplaceItemCard = memo(MarketplaceItemCardComponent);
