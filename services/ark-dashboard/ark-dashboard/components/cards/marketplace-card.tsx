'use client';

import {
  Bot,
  Check,
  Download,
  ExternalLink,
  Package,
  Pencil,
  Server,
  Trash2,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MarketplaceItem } from '@/lib/types/marketplace';

interface MarketplaceCardProps {
  item: MarketplaceItem;
  onInstall: (item: MarketplaceItem) => void;
  onEdit?: (item: MarketplaceItem) => void;
  onDelete?: (item: MarketplaceItem) => void;
}

const typeIcons: Record<string, React.ElementType> = {
  executor: Zap,
  service: Server,
  agent: Bot,
  tool: Wrench,
  team: Users,
};

const typeColors: Record<string, string> = {
  executor:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  service: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  agent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  tool: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  team: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
};

export function MarketplaceCard({
  item,
  onInstall,
  onEdit,
  onDelete,
}: MarketplaceCardProps) {
  const TypeIcon = typeIcons[item.type] || Package;
  const isLocal = item.source === 'Local';

  return (
    <Card className="relative flex h-full flex-col">
      <CardHeader className="flex flex-row items-start gap-3 pr-3.5">
        <div className="bg-muted flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
          <TypeIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate text-base">
              {item.displayName}
            </CardTitle>
            {item.installed && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 text-xs">
                      <Check className="h-3 w-3" />
                      Installed
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Installed in namespace:{' '}
                      {item.installedNamespace || 'default'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
            <span>{item.author}</span>
            <span>v{item.version}</span>
          </div>
        </div>
        <CardAction className="flex gap-1">
          {isLocal && onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isLocal && onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => onDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardAction>
      </CardHeader>

      <div className="flex flex-1 flex-col px-6 pb-4">
        <CardDescription className="line-clamp-2 flex-1 text-sm">
          {item.description}
        </CardDescription>

        <div className="mt-3 flex flex-wrap gap-1">
          <Badge variant="outline" className={typeColors[item.type]}>
            {item.type}
          </Badge>
          {item.ark?.agentic && (
            <Badge
              variant="outline"
              className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Agentic
            </Badge>
          )}
          {item.tags?.slice(0, 2).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {item.tags && item.tags.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{item.tags.length - 2}
            </Badge>
          )}
        </div>

        <div className="text-muted-foreground mt-3 flex items-center justify-between border-t pt-3 text-xs">
          <span>{item.source}</span>
          <div className="flex items-center gap-2">
            {item.documentation && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={item.documentation}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>View Documentation</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!item.installed && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => onInstall(item)}>
                <Download className="mr-1 h-3 w-3" />
                Add to Ark
              </Button>
            )}
            {item.installed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled>
                <Check className="mr-1 h-3 w-3" />
                Installed
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
