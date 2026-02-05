'use client';

import { format } from 'date-fns';
import { AlertTriangle, Download, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
    <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-1 items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-sm text-amber-900 dark:text-amber-100">
          To bring changes made in the Dashboard locally, export the required
          resources via{' '}
          <Link
            href="/export"
            className="font-semibold underline hover:no-underline">
            export section
          </Link>
          {' - last export '}
          <span className="font-mono">{formatExportTime(lastExportTime)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/export">
          <Button size="sm" variant="outline" className="gap-2">
            <Download className="h-3 w-3" />
            Export
          </Button>
        </Link>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsVisible(false)}
          className="h-auto p-1">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
