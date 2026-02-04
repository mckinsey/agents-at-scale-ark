'use client';

import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { activeSettingPageAtom, settingsModalOpenAtom } from '@/atoms/settings-modal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { SettingsContent } from './settings-content';
import { SettingsSidebar } from './settings-sidebar';

const SETTINGS_KEYBOARD_SHORTCUT = 'e';

export function SettingsModal() {
  const [isModalOpen, setIsModalOpen] = useAtom(settingsModalOpenAtom);
  const activeSettingPage = useAtomValue(activeSettingPageAtom);

  const toggleModal = () => {
    setIsModalOpen(prev => !prev);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SETTINGS_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogContent
        className="!max-w-[100vw] !max-h-[100vh] w-screen h-screen p-0 !gap-0 rounded-none overflow-hidden"
        showCloseButton={true}
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
