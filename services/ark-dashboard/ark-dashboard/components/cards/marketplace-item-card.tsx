'use client';

import {
  CheckCircle,
  Download,
  ExternalLink,
  Loader2,
  Star,
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
  const installMutation = useInstallMarketplaceItem();

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await installMutation.mutateAsync(item.id);
      setLocalStatus('installed');
      toast.success(`${item.name} installed successfully`);
    } catch (error) {
      toast.error(`Failed to install ${item.name}`, {
        description: error instanceof Error ? error.message : 'Unknown error',
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
                    Installing
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
    </Card>
  );
}
