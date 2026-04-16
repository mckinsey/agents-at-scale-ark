'use client';

import { useAtomValue } from 'jotai';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';

const SETTINGS_KEYBOARD_SHORTCUT = 'e';

export function SettingsKeyboardShortcut() {
  const router = useRouter();
  const pathname = usePathname();
  const settingsEntryUrl = useAtomValue(settingsEntryUrlAtom);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SETTINGS_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        if (pathname.startsWith('/settings')) {
          router.push(settingsEntryUrl ?? '/');
        } else {
          router.push('/settings');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, pathname, settingsEntryUrl]);

  return null;
}
