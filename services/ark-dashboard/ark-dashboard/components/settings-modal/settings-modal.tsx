'use client';

import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';

import {
  activeSettingPageAtom,
  settingsModalOpenAtom,
} from '@/atoms/settings-modal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { SettingsContent } from './settings-content';
import { SettingsSidebar } from './settings-sidebar';

const SETTINGS_KEYBOARD_SHORTCUT = 'e';

export function SettingsModal() {
  const [isModalOpen, setIsModalOpen] = useAtom(settingsModalOpenAtom);
  const activeSettingPage = useAtomValue(activeSettingPageAtom);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SETTINGS_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setIsModalOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsModalOpen]);

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogContent
        className="h-screen !max-h-[100vh] w-screen !max-w-[100vw] !gap-0 overflow-hidden rounded-none p-0"
        showCloseButton={false}
        onOpenAutoFocus={e => e.preventDefault()}>
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-full w-full overflow-hidden">
          <SettingsSidebar />
          <SettingsContent activePage={activeSettingPage} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
