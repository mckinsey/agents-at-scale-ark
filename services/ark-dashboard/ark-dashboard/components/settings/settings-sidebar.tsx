'use client';

import { useAtomValue } from 'jotai';

import {
  isExperimentalExecutionEngineEnabledAtom,
  isMarketplaceEnabledAtom,
} from '@/atoms/experimental-features';
import { settingsEntryUrlAtom } from '@/atoms/navigation-history';
import { Close } from '@/components/icons';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { cn } from '@/lib/utils';

import {
  type ExperimentalSettingPage,
  type SettingPage,
  settingsSections,
} from './settings-types';

type SettingsSidebarProps = {
  activePage: SettingPage;
};

export function SettingsSidebar({ activePage }: SettingsSidebarProps) {
  const { push, replace } = useNamespacedNavigation();
  const settingsEntryUrl = useAtomValue(settingsEntryUrlAtom);
  const isExperimentalExecutionEngineEnabled = useAtomValue(
    isExperimentalExecutionEngineEnabledAtom,
  );
  const isMarketplaceEnabled = useAtomValue(isMarketplaceEnabledAtom);

  const isExperimentalEnabled: Record<ExperimentalSettingPage, boolean> = {
    'execution-engines': isExperimentalExecutionEngineEnabled,
    'manage-marketplace': isMarketplaceEnabled,
  };

  const visibleSections = settingsSections.map(section => ({
    ...section,
    items: section.items.filter(
      item => !item.experimental || isExperimentalEnabled[item.key],
    ),
  }));

  const handleSettingClick = (settingKey: SettingPage) => {
    replace(`/settings/${settingKey}`);
  };

  // settingsEntryUrl is captured from the in-app location the user came from,
  // so it may already carry a namespace query; push merges params and won't double it.
  const handleClose = () => {
    push(settingsEntryUrl ?? '/');
  };

  return (
    <div className="bg-sidebar border-stroke-active-inverse flex w-64 flex-col border-r-2">
      <div className="flex flex-col justify-center px-6 pt-10 pb-4">
        <div className="flex h-8 items-center justify-between pl-3">
          <h2 className="headings-h4-semibold text-fg-secondary">Settings</h2>
          <IconActionButton label="Close settings" onClick={handleClose}>
            <Close />
          </IconActionButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pt-3 pb-6">
        <div className="flex flex-col gap-6">
          {visibleSections.map(section => (
            <div key={section.sectionKey} className="flex flex-col gap-1">
              {section.sectionLabel && (
                <div className="text-fg-tertiary label-small-primary px-3">
                  {section.sectionLabel}
                </div>
              )}
              {section.items.map(item => (
                <button
                  key={item.key}
                  onClick={() => handleSettingClick(item.key)}
                  aria-current={activePage === item.key ? 'page' : undefined}
                  className={cn(
                    'paragraph-regular-primary flex w-full cursor-pointer items-center py-2 pr-2 pl-3 text-left transition-colors',
                    'hover:bg-stateslayer-overlay-hover',
                    'focus-visible:ring-stroke-status-focus focus-visible:ring-1 focus-visible:outline-none',
                    activePage === item.key
                      ? 'text-fg-primary'
                      : 'text-fg-secondary',
                  )}>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
