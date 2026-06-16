'use client';

import {
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  GitBranch,
  Package,
  Star,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  useGetMarketplaceItemById,
  useInstallMarketplaceItem,
  useUninstallMarketplaceItem,
} from '@/lib/services/marketplace-hooks';

export default function MarketplaceDetailPage() {
  const params = useParams();
  const { push } = useNamespacedNavigation();
  const id = params.id as string;

  const { data: item, isPending, error } = useGetMarketplaceItemById(id);
  const installMutation = useInstallMarketplaceItem();
  const uninstallMutation = useUninstallMarketplaceItem();

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
    uninstallMutation.mutate(id);
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
          <Package className="text-muted-foreground mx-auto h-12 w-12" />
          <h2 className="mt-4 text-lg font-semibold">Item not found</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            The marketplace item you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button
            onClick={() => push('/marketplace')}
            variant="outline"
            className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <PageHeader currentPage={item.name} />
      <main className="container space-y-8 p-6 py-8">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => push('/marketplace')}
            variant="ghost"
            size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div>
              <div className="flex items-start gap-4">
                <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-lg text-3xl">
                  {item.icon || '📦'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold">{item.name}</h1>
                    {item.status === 'installed' && (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    )}
                  </div>
                  <p className="text-muted-foreground mt-2 text-lg">
                    {item.shortDescription}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={getCategoryColor(item.category)}>
                      {item.category.replace('-', ' ')}
                    </Badge>
                    <Badge variant="outline">{item.type}</Badge>
                    {item.featured && (
                      <Badge
                        variant="secondary"
                        className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                        Featured
                      </Badge>
                    )}
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
                          <Badge key={tag} variant="secondary">
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
                        <p className="text-muted-foreground mb-2 text-sm">
                          Run the following command to install:
                        </p>
                        <div className="bg-muted flex items-center gap-2 rounded-lg p-3 font-mono text-sm">
                          <Terminal className="text-muted-foreground h-4 w-4" />
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
                              <Badge variant="outline">{entry.version}</Badge>
                              <span className="text-muted-foreground text-sm">
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
                      <p className="text-muted-foreground text-center text-xs">
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

                  {item.status === 'installed' && item.uis && item.uis.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        {item.uis.map((ui) => (
                          <Button
                            key={ui.url}
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => window.open(ui.url, '_blank')}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {ui.label}
                            <ExternalLink className="ml-auto h-3 w-3" />
                          </Button>
                        ))}
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-medium">v{item.version}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Downloads</span>
                      <span className="font-medium">
                        {formatDownloads(item.downloads)}
                      </span>
                    </div>
                    {item.rating && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Rating</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-current text-yellow-500" />
                          <span className="font-medium">
                            {item.rating.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Author</span>
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
                              <GitBranch className="mr-2 h-4 w-4" />
                              View Repository
                              <ExternalLink className="ml-auto h-3 w-3" />
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
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Documentation
                              <ExternalLink className="ml-auto h-3 w-3" />
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
      </main>
    </div>
  );
}

function MarketplaceDetailSkeleton() {
  return (
    <div className="bg-background min-h-screen">
      <PageHeader currentPage="Loading..." />
      <main className="container space-y-8 p-6 py-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16 rounded-lg" />
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
