'use client';

import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';

import { marketplaceInstallRecordsAtom } from '@/atoms/marketplace-install';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useSettleInstalls } from '@/lib/hooks/use-marketplace-install-state';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

/**
 * Announces install outcomes once per tab. Every tab watches the shared record
 * store, so each viewer is told exactly once without any cross-tab plumbing.
 */
function useInstallCompletionToasts(): void {
  const records = useAtomValue(marketplaceInstallRecordsAtom);
  const announcedRef = useRef<Set<string>>(new Set());
  const { push } = useNamespacedNavigation();
  const seededRef = useRef(false);

  useEffect(() => {
    // Records already terminal on first render are history, not news.
    if (!seededRef.current) {
      seededRef.current = true;
      for (const [key, record] of Object.entries(records)) {
        if (record.state !== 'installing') {
          announcedRef.current.add(key);
        }
      }
      return;
    }

    for (const [key, record] of Object.entries(records)) {
      if (record.state === 'installing' || announcedRef.current.has(key)) {
        continue;
      }
      announcedRef.current.add(key);

      if (record.state === 'installed') {
        toast.success(`${record.itemName} installed`, {
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => push('/marketplace')}>
              View
            </Button>
          ),
        });
      } else if (record.state === 'timed-out') {
        toast.error(
          `${record.itemName} timed out before finishing. Contact the platform team.`,
          { duration: 8000 },
        );
      } else {
        toast.error(
          `${record.itemName} failed to install. Contact the platform team.`,
          { duration: 8000 },
        );
      }
    }
  }, [records, push]);
}

/**
 * Headless. Advances in-flight installs and announces outcomes, so that logic
 * is not coupled to whichever component happens to render the progress.
 */
export function MarketplaceInstallWatcher() {
  useSettleInstalls();
  useInstallCompletionToasts();
  return null;
}
