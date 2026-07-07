'use client';

import { type ReactNode, useState } from 'react';

import { PanelToggleButton } from '@/components/common/panel-toggle-button';
import { ResourceSwitcherBar } from '@/components/common/resource-switcher-bar';
import { ChevronLeft, Warning } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';

interface ResourceStudioLayoutProps {
  listHref: string;
  listLabel: string;
  displayName: string;
  saving: boolean;
  hasChanges: boolean;
  readOnlyMode: boolean;
  onSave: () => void;
  switcherValue: string | undefined;
  switcherPlaceholder: string;
  switcherItems: { name: string }[];
  switcherLoading?: boolean;
  onSwitcherSelect: (value: string) => void;
  showYaml: boolean;
  onToggleYaml: () => void;
  yamlContent: ReactNode;
  formContent: ReactNode;
  chatPanel: ReactNode;
}

/**
 * Shared shell for the agent/team studio (view/edit): breadcrumb header with
 * Back/Save actions, a collapsible left configuration panel (resource switcher
 * + YAML/form scroll area), and an embedded chat panel on the right.
 */
export function ResourceStudioLayout({
  listHref,
  listLabel,
  displayName,
  saving,
  hasChanges,
  readOnlyMode,
  onSave,
  switcherValue,
  switcherPlaceholder,
  switcherItems,
  switcherLoading,
  onSwitcherSelect,
  showYaml,
  onToggleYaml,
  yamlContent,
  formContent,
  chatPanel,
}: Readonly<ResourceStudioLayoutProps>) {
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);

  return (
    <div className="flex min-h-0 w-full content-shell flex-1 flex-col overflow-hidden">
      <header className="flex flex-none flex-col gap-4 pb-5">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <NamespacedLink
              href={listHref}
              className="text-fg-disabled hover:text-fg-secondary flex items-center gap-1 transition-colors">
              <IconShell size="sm" className="opacity-100">
                <ChevronLeft />
              </IconShell>
              {listLabel}
            </NamespacedLink>
            <span aria-hidden="true" className="text-fg-secondary">
              /
            </span>
            <span aria-current="page" className="text-fg-secondary">
              {displayName}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <NamespacedLink href={listHref}>
              <Button variant="outline">Back</Button>
            </NamespacedLink>
            <Button
              onClick={onSave}
              disabled={saving || !hasChanges || readOnlyMode}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <h1 className="text-fg-primary text-xl leading-7">{displayName}</h1>
          {hasChanges && (
            <div className="flex items-center gap-1">
              <IconShell size="sm" className="text-status-warning opacity-100">
                <Warning />
              </IconShell>
              <span className="text-fg-primary text-sm leading-5 tracking-[-0.112px]">
                You have unsaved changes
              </span>
            </div>
          )}
        </div>
      </header>

      <div
        className={`relative flex min-h-0 flex-1 overflow-hidden ${
          isLeftPanelCollapsed ? '' : 'gap-6'
        }`}>
        <div
          className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ${
            isLeftPanelCollapsed ? 'w-0' : 'flex-1'
          }`}>
          {!isLeftPanelCollapsed && (
            <div className="flex min-h-0 flex-1 flex-col">
              <ResourceSwitcherBar
                value={switcherValue}
                placeholder={switcherPlaceholder}
                items={switcherItems}
                loading={switcherLoading}
                onSelect={onSwitcherSelect}
                showYaml={showYaml}
                onToggleYaml={onToggleYaml}
              />
              <ScrollArea className="h-0 min-h-0 flex-1">
                {showYaml ? yamlContent : formContent}
              </ScrollArea>
            </div>
          )}
        </div>

        <PanelToggleButton
          isCollapsed={isLeftPanelCollapsed}
          onToggle={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
        />

        <div
          className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ${
            isLeftPanelCollapsed ? 'w-full' : 'flex-1'
          }`}>
          {chatPanel}
        </div>
      </div>
    </div>
  );
}
