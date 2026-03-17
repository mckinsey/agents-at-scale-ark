'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const SETTINGS_KEYBOARD_SHORTCUT = 'e';

export function SettingsKeyboardShortcut() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SETTINGS_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        router.push('/settings');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  return null;
}
