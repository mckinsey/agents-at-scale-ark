'use client';

import { format } from 'date-fns';
import { AlertTriangle, Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { exportService } from '@/lib/services/export';

export function ExportBanner() {
  const [lastExportTime, setLastExportTime] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Load last export time on mount
    exportService.getLastExportTime().then(time => {
      setLastExportTime(time);
    });

    // Check for updates every minute
    const interval = setInterval(() => {
      exportService.getLastExportTime().then(updatedTime => {
        setLastExportTime(updatedTime);
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Don't show banner if dismissed
  if (!isVisible) return null;

  const formatExportTime = (isoString: string | null) => {
    if (!isoString) return 'Never';
    try {
      const date = new Date(isoString);
      return format(date, 'MM/dd/yy HH:mm:ss') + ' GMT';
    } catch {
      return 'Never';
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-1 items-start gap-2 sm:items-center">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 sm:mt-0 dark:text-amber-400" />
        <span className="text-xs text-amber-900 sm:text-sm dark:text-amber-100">
          <span className="block sm:inline">
            To bring changes made in the Dashboard locally, export the required
            resources via{' '}
            <NamespacedLink
              href="/export"
              className="font-semibold underline hover:no-underline">
              export section
            </NamespacedLink>
          </span>
          {lastExportTime && (
            <span className="mt-1 block text-[10px] sm:mt-0 sm:ml-1 sm:inline sm:text-xs">
              {' - last export '}
              <span className="font-mono">
                {formatExportTime(lastExportTime)}
              </span>
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <NamespacedLink href="/export">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 px-2 py-1 text-xs sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm">
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </NamespacedLink>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsVisible(false)}
          className="h-auto p-1">
          <X className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </div>
    </div>
  );
}
