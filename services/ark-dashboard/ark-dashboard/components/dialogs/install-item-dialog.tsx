'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';
import { useGetAllNamespaces } from '@/lib/services/namespaces-hooks';
import type { MarketplaceItem } from '@/lib/types/marketplace';

interface InstallItemDialogProps {
  item: MarketplaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InstallItemDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: InstallItemDialogProps) {
  const [namespace, setNamespace] = useState('default');
  const [releaseName, setReleaseName] = useState('');
  const [installStatus, setInstallStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const { data: namespaces = [] } = useGetAllNamespaces();
  const installItem = useInstallMarketplaceItem({
    onSuccess: () => {
      setInstallStatus('success');
      setTimeout(() => {
        onSuccess();
        setInstallStatus('idle');
      }, 1500);
    },
  });

  const handleInstall = useCallback(() => {
    if (!item) return;

    setInstallStatus('loading');
    setErrorMessage('');

    installItem.mutate(
      {
        name: item.name,
        source: item.source,
        options: {
          namespace,
          releaseName: releaseName || undefined,
        },
      },
      {
        onError: (error: Error) => {
          setInstallStatus('error');
          setErrorMessage(error.message);
        },
      },
    );
  }, [item, namespace, releaseName, installItem]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setInstallStatus('idle');
        setErrorMessage('');
        setReleaseName('');
        setNamespace('default');
      }
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  if (!item) return null;

  const isService = item.type === 'service';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Install {item.displayName}</DialogTitle>
          <DialogDescription>
            Configure installation options for this {item.type}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-medium">{item.displayName}</h4>
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{item.type}</Badge>
                  <Badge variant="outline">v{item.version}</Badge>
                  {item.ark?.agentic && (
                    <Badge
                      variant="outline"
                      className="bg-yellow-100 text-yellow-800">
                      Agentic
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="namespace">Namespace</Label>
              <Select value={namespace} onValueChange={setNamespace}>
                <SelectTrigger id="namespace">
                  <SelectValue placeholder="Select namespace" />
                </SelectTrigger>
                <SelectContent>
                  {namespaces.map(ns => (
                    <SelectItem key={ns.name} value={ns.name}>
                      {ns.name}
                    </SelectItem>
                  ))}
                  {item.ark?.namespace &&
                    !namespaces.some(ns => ns.name === item.ark?.namespace) && (
                      <SelectItem value={item.ark.namespace}>
                        {item.ark.namespace} (recommended)
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>

            {isService && (
              <div className="space-y-2">
                <Label htmlFor="releaseName">Release Name (optional)</Label>
                <Input
                  id="releaseName"
                  placeholder={item.ark?.helmReleaseName || item.name}
                  value={releaseName}
                  onChange={e => setReleaseName(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Leave empty to use the default:{' '}
                  {item.ark?.helmReleaseName || item.name}
                </p>
              </div>
            )}
          </div>

          {item.ark?.requirements && item.ark.requirements.length > 0 && (
            <div className="rounded-lg border p-3">
              <h5 className="mb-2 text-sm font-medium">Requirements</h5>
              <ul className="text-muted-foreground space-y-1 text-sm">
                {item.ark.requirements.map((req, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-500" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {installStatus === 'error' && (
            <div className="border-destructive bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
              <AlertCircle className="h-4 w-4" />
              {errorMessage || 'Installation failed'}
            </div>
          )}

          {installStatus === 'success' && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500 bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              <Check className="h-4 w-4" />
              Successfully installed to {namespace}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={
              installStatus === 'loading' || installStatus === 'success'
            }>
            {installStatus === 'loading' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {installStatus === 'success' && <Check className="mr-2 h-4 w-4" />}
            {installStatus === 'loading'
              ? 'Installing...'
              : installStatus === 'success'
                ? 'Installed'
                : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
