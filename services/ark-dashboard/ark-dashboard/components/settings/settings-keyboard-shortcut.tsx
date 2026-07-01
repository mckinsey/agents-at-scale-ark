'use client';

import { useAtomValue } from 'jotai';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

const SETTINGS_KEYBOARD_SHORTCUT = 'e';

export function SettingsKeyboardShortcut() {
  const { push } = useNamespacedNavigation();
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
          push(settingsEntryUrl ?? '/');
        } else {
          push('/settings');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [push, pathname, settingsEntryUrl]);

  return null;
}
