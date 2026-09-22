'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { MarketplaceCommandDialog } from '@/components/cards/marketplace-command-dialog';
import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import {
  ArrowBack,
  CheckCircle,
  Code,
  InsertDriveFile,
  OpenInNew,
  Storefront,
  Terminal,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useListReturnHref } from '@/lib/hooks/use-list-return-href';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  useGetMarketplaceItemById,
  useInstallMarketplaceItem,
  useUninstallMarketplaceItem,
} from '@/lib/services/marketplace-hooks';

export default function MarketplaceDetailPage() {
  const params = useParams();
  const { push } = useNamespacedNavigation();
  const marketplaceReturnHref = useListReturnHref('/marketplace');
  const id = params.id as string;

  const { data: item, isPending, error } = useGetMarketplaceItemById(id);
  const installMutation = useInstallMarketplaceItem();
  const uninstallMutation = useUninstallMarketplaceItem();
  const [uninstallCommand, setUninstallCommand] = useState<{
    open: boolean;
    helmCommand?: string;
    name?: string;
  }>({ open: false });

  useEffect(() => {
    if (error) {
      toast.error('Failed to load marketplace item', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [error]);

  const handleInstall = () => {
    installMutation.mutate(id);
  };

  const handleUninstall = () => {
    uninstallMutation.mutateAsync(id).then(
      result => {
        if (result && typeof result === 'object' && 'status' in result) {
          const data = result as Record<string, unknown>;
          if (data.status === 'command') {
            setUninstallCommand({
              open: true,
              helmCommand: data.helmCommand as string | undefined,
              name: (data.name as string | undefined) || item?.name,
            });
          }
        }
      },
      () => undefined,
    );
  };

  const getCategoryColor = (category: string) => {
    const hues: Record<string, string> = {
      agents: 'text-blue-500',
      workflows: 'text-pink-500',
      'mcp-servers': 'text-violet-500',
    };
    return hues[category] ?? '';
  };

  const formatDownloads = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  if (isPending) {
    return <MarketplaceDetailSkeleton />;
  }

  if (!item) {
    return (
      <div className="container p-6">
        <div className="text-center">
          <Storefront className="text-fg-secondary mx-auto h-12 w-12" />
          <h2 className="mt-4 text-lg font-semibold">Item not found</h2>
          <p className="text-fg-secondary mt-2 text-sm">
            The marketplace item you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button
            onClick={() => push(marketplaceReturnHref)}
            variant="outline"
            className="mt-4">
            <ArrowBack className="mr-2 h-4 w-4" />
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <main className="container space-y-8 p-6 py-8">
        <DetailBreadcrumb
          backHref="/marketplace"
          backLabel="Marketplace"
          current={item.name}
        />

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div>
              <div className="flex items-start gap-4">
                <div className="bg-surface-bg-tertiary flex h-16 w-16 items-center justify-center text-3xl">
                  {item.icon || '📦'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold">{item.name}</h1>
                    {item.status === 'installed' && (
                      <CheckCircle
                        data-testid="installed-marker"
                        className="text-fg-success h-6 w-6"
                      />
                    )}
                  </div>
                  <p className="text-fg-secondary mt-2 text-lg">
                    {item.shortDescription}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="alternative"
                      className={getCategoryColor(item.category)}>
                      {item.category.replace('-', ' ')}
                    </Badge>
                    <Badge outline>{item.type}</Badge>
                    {item.featured && <Badge variant="warning">Featured</Badge>}
                  </div>
                </div>
              </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="installation">Installation</TabsTrigger>
                {item.changelog && item.changelog.length > 0 && (
                  <TabsTrigger value="changelog">Changelog</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {item.longDescription || item.description}
                    </div>
                  </CardContent>
                </Card>

                {item.requirements && item.requirements.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Requirements</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1 pl-5">
                        {item.requirements.map((req, index) => (
                          <li key={index} className="text-sm">
                            {req}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {item.tags && item.tags.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Tags</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {item.tags.map(tag => (
                          <Badge key={tag} variant="alternative">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="installation" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Installation Instructions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {item.installCommand && (
                      <div>
                        <p className="text-fg-secondary mb-2 text-sm">
                          Run the following command to install:
                        </p>
                        <div className="bg-surface-bg-tertiary paragraph-code-text flex items-center gap-2 p-3">
                          <Terminal className="text-fg-secondary h-4 w-4" />
                          <code className="flex-1">{item.installCommand}</code>
                        </div>
                      </div>
                    )}

                    {item.dependencies && item.dependencies.length > 0 && (
                      <div>
                        <h4 className="mb-2 font-medium">Dependencies</h4>
                        <ul className="list-disc space-y-1 pl-5">
                          {item.dependencies.map((dep, index) => (
                            <li key={index} className="text-sm">
                              {dep}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {item.changelog && item.changelog.length > 0 && (
                <TabsContent value="changelog" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Version History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {item.changelog.map((entry, index) => (
                          <div key={index}>
                            <div className="flex items-center gap-2">
                              <Badge outline>{entry.version}</Badge>
                              <span className="text-fg-secondary text-sm">
                                {entry.date}
                              </span>
                            </div>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {entry.changes.map((change, changeIndex) => (
                                <li key={changeIndex} className="text-sm">
                                  {change}
                                </li>
                              ))}
                            </ul>
                            {index < item.changelog!.length - 1 && (
                              <Separator className="mt-4" />
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {item.status === 'installed' ? (
                    <div className="space-y-2">
                      <Button
                        onClick={handleUninstall}
                        variant="destructive"
                        className="w-full"
                        disabled={uninstallMutation.isPending}>
                        Uninstall
                      </Button>
                      <p className="text-fg-secondary text-center text-xs">
                        Currently installed
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={handleInstall}
                      className="w-full"
                      disabled={installMutation.isPending}>
                      Install
                    </Button>
                  )}

                  {item.status === 'installed' &&
                    item.uis &&
                    item.uis.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          {item.uis.map(ui => (
                            <Button
                              key={ui.url}
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => window.open(ui.url, '_blank')}>
                              <OpenInNew className="mr-2 h-4 w-4" />
                              {ui.label}
                              <OpenInNew className="ml-auto h-3 w-3" />
                            </Button>
                          ))}
                        </div>
                      </>
                    )}

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg-secondary">Version</span>
                      <span className="font-medium">v{item.version}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg-secondary">Downloads</span>
                      <span className="font-medium">
                        {formatDownloads(item.downloads)}
                      </span>
                    </div>
                    {item.rating && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-fg-secondary">Rating</span>
                        <span className="text-fg-primary font-medium">
                          {item.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg-secondary">Author</span>
                      <span className="font-medium">{item.author}</span>
                    </div>
                  </div>

                  {(item.repository || item.documentation) && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        {item.repository && (
                          <Link
                            href={item.repository}
                            target="_blank"
                            rel="noopener noreferrer">
                            <Button
                              variant="outline"
                              className="w-full justify-start">
                              <Code className="mr-2 h-4 w-4" />
                              View Repository
                              <OpenInNew className="ml-auto h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                        {item.documentation && (
                          <Link
                            href={item.documentation}
                            target="_blank"
                            rel="noopener noreferrer">
                            <Button
                              variant="outline"
                              className="w-full justify-start">
                              <InsertDriveFile className="mr-2 h-4 w-4" />
                              Documentation
                              <OpenInNew className="ml-auto h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <MarketplaceCommandDialog
          open={uninstallCommand.open}
          onOpenChange={open => setUninstallCommand(s => ({ ...s, open }))}
          command={{
            helmCommand: uninstallCommand.helmCommand,
            name: uninstallCommand.name,
          }}
          itemName={item.name}
          action="uninstall"
        />
      </main>
    </div>
  );
}

function MarketplaceDetailSkeleton() {
  return (
    <div className="bg-background min-h-screen">
      <main className="container space-y-8 p-6 py-8">
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-5 w-full max-w-md" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-sm" />
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            </div>
          </div>
          <div>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-px w-full" />
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
