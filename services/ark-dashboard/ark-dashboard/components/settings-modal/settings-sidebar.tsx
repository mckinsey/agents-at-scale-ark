'use client';

import { useSetAtom } from 'jotai';

import { activeSettingPageAtom } from '@/atoms/settings-modal';
import type { SettingPage } from '@/atoms/settings-modal';
import { cn } from '@/lib/utils';

import { settingsSections } from './settings-types';

export function SettingsSidebar() {
  const setActiveSettingPage = useSetAtom(activeSettingPageAtom);

  const handleSettingClick = (settingKey: SettingPage) => {
    setActiveSettingPage(settingKey);
  };

  return (
    <div className="bg-sidebar flex w-64 flex-col">
      <div className="px-6 py-8">
        <h2 className="text-md text-sidebar-foreground">Settings</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {settingsSections.map(section => (
            <div key={section.sectionKey} className="space-y-2">
              <div className="text-sidebar-foreground px-2 text-xs">
                {section.sectionLabel}
              </div>
              <div className="space-y-1 pl-2">
                {section.items.map(item => {
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
