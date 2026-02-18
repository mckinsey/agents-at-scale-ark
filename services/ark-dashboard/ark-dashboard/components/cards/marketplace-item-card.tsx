'use client';

import {
  CheckCircle,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Star,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

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
    toast.info(`Preparing installation for ${item.name}...`);
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

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      observability: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      tools: 'bg-green-500/10 text-green-700 dark:text-green-400',
      'mcp-servers': 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
      agents: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
      models: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
      workflows: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
      integrations: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    };
    return (
      colors[category] || 'bg-gray-500/10 text-gray-700 dark:text-gray-400'
    );
  };

  const getStatusIcon = () => {
    if (localStatus === 'installed') {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
    return null;
  };

  const formatDownloads = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <Card
      className={cn(
        'group relative flex h-full flex-col transition-all hover:shadow-lg',
        className,
      )}>
      {item.featured && (
        <div className="absolute top-2 right-2 z-10">
          <Badge
            variant="secondary"
            className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
            Featured
          </Badge>
        </div>
      )}

      <CardHeader className="flex-none">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg text-xl">
              {item.icon || '📦'}
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                {item.name}
                {getStatusIcon()}
              </CardTitle>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn('text-xs', getCategoryColor(item.category))}>
                  {item.category.replace('-', ' ')}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {item.type}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <CardDescription className="line-clamp-2">
          {item.shortDescription}
        </CardDescription>

        <div className="text-muted-foreground mt-4 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            <span>{formatDownloads(item.downloads)}</span>
          </div>
          {item.rating && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-current text-yellow-500" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span>v{item.version}</span>
          </div>
        </div>

        {item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{item.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-none border-t pt-4">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            {item.repository && (
              <Button
                variant="ghost"
                size="sm"
                onClick={e => {
                  e.stopPropagation();
                  window.open(item.repository, '_blank');
                }}
                className="h-8 px-2">
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {item.documentation && (
              <Link
                href={item.documentation}
                onClick={e => e.stopPropagation()}
                target="_blank">
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  Docs
                </Button>
              </Link>
            )}
          </div>

          <div className="flex gap-2">
            {localStatus === 'installed' ? (
              <Button variant="outline" size="sm" disabled className="h-8">
                <CheckCircle className="mr-1 h-3 w-3" />
                Installed
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="h-8"
                onClick={handleInstall}
                disabled={isInstalling}>
                {isInstalling ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Download className="mr-1 h-3 w-3" />
                    Install
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={e => {
                e.stopPropagation();
                const url = item.documentation || item.repository;
                if (url) {
                  window.open(url, '_blank');
                }
              }}>
              View
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
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
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Command copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Installation Instructions for {installCommand.name || itemName}
          </DialogTitle>
          <DialogDescription>
            To complete the installation, run one of these commands in your
            local terminal:
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
                  onClick={() => copyToClipboard(installCommand.arkCommand!)}>
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
                  onClick={() => copyToClipboard(installCommand.helmCommand!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              ℹ️ For security reasons, the dashboard cannot directly install
              packages. Please run one of the commands above in your terminal
              where kubectl is configured to your cluster.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
