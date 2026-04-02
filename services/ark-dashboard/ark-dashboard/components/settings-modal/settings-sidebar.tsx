'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { X } from 'lucide-react';

import { isMarketplaceEnabledAtom } from '@/atoms/experimental-features';
import {
  activeSettingPageAtom,
  settingsModalOpenAtom,
} from '@/atoms/settings-modal';
import type { SettingPage } from '@/atoms/settings-modal';
import { cn } from '@/lib/utils';

import { MANAGE_MARKETPLACE_KEY, settingsSections } from './settings-types';

export function SettingsSidebar() {
  const setActiveSettingPage = useSetAtom(activeSettingPageAtom);
  const [, setIsModalOpen] = useAtom(settingsModalOpenAtom);
  const isMarketplaceEnabled = useAtomValue(isMarketplaceEnabledAtom);

  const handleSettingClick = (settingKey: SettingPage) => {
    setActiveSettingPage(settingKey);
  };

  const handleClose = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="bg-sidebar flex w-64 flex-col">
      <div className="flex items-center justify-between px-6 py-8">
        <h2 className="text-md text-sidebar-foreground">Settings</h2>
        <button
          onClick={handleClose}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md p-2 transition-all duration-200 hover:scale-110"
          aria-label="Close settings">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {settingsSections.map(section => (
            <div key={section.sectionKey} className="space-y-2">
              <div className="text-sidebar-foreground px-2 text-xs">
                {section.sectionLabel}
              </div>
              <div className="space-y-1 pl-2">
                {section.items.filter(item => item.key !== MANAGE_MARKETPLACE_KEY || isMarketplaceEnabled).map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleSettingClick(item.key)}
                      className={cn(
                        'text-sidebar-foreground flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
                      )}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
