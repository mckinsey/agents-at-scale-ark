'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { type ComponentType, useEffect, useState } from 'react';

import {
  isExperimentalDarkModeEnabledAtom,
  isFilesBrowserAvailableAtom,
  storedIsExperimentalDarkModeEnabledAtom,
} from '@/atoms/experimental-features';
import { tourActiveSectionAtom } from '@/atoms/onboarding';
import {
  AccountTree,
  Bedtime,
  Build,
  ChevronDown,
  ChevronRight,
  Dashboard,
  Database,
  Dns,
  Earthquake,
  Help,
  InsertDriveFile,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  LightMode,
  Logout,
  Memory,
  PlaylistAddCheck,
  PlugConnect,
  SaveAlt,
  Settings,
  Shield,
  SmartToy,
  Storefront,
  Tune,
  UnfoldMore,
  VpnKey,
} from '@/components/icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { trackEvent } from '@/lib/analytics/singleton';
import { signout } from '@/lib/auth/signout';
import {
  AGENT_BUILDER_SECTIONS,
  type DashboardSection,
  MONITORING_SECTIONS,
} from '@/lib/constants/dashboard-icons';
import { navTargetId } from '@/lib/constants/tour-steps';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { proxyService } from '@/lib/services/proxy';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useUser } from '@/providers/UserProvider';

import qbLogoDark from '../app/img/qb-logo-dark.svg';
import qbLogoLight from '../app/img/qb-logo-light.svg';
import { UserDetails } from './user';

interface NavItemConfig {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const HOME_ITEM: NavItemConfig = { key: '', label: 'Home', icon: Dashboard };

const BUILD_ITEMS: NavItemConfig[] = [
  { key: 'workflow-templates', label: 'Workflows', icon: AccountTree },
  { key: 'mcp', label: 'MCPs', icon: PlugConnect },
  { key: 'tools', label: 'Tools', icon: Build },
  { key: 'memory', label: 'Memory', icon: Database },
  { key: 'models', label: 'Models', icon: Memory },
];

const MARKETPLACE_ITEM: NavItemConfig = {
  key: 'marketplace',
  label: 'Marketplace',
  icon: Storefront,
};

const OTHER_ITEMS: NavItemConfig[] = [
  { key: 'files', label: 'Files', icon: InsertDriveFile },
  { key: 'tasks', label: 'A2A tasks', icon: PlaylistAddCheck },
  { key: 'a2a', label: 'A2A servers', icon: Dns },
  { key: 'secrets', label: 'Secrets', icon: Shield },
  { key: 'configurations', label: 'Configurations', icon: Tune },
  { key: 'api-keys', label: 'API keys', icon: VpnKey },
  { key: 'export', label: 'Exports', icon: SaveAlt },
];

const SETTINGS_ITEM: NavItemConfig = {
  key: 'settings',
  label: 'Settings',
  icon: Settings,
};

type SectionGroupKey = 'agent-builder' | 'monitoring';

interface SectionGroupConfig {
  key: SectionGroupKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  sections: DashboardSection[];
}

const AGENT_BUILDER_GROUP: SectionGroupConfig = {
  key: 'agent-builder',
  label: 'Agent builder',
  icon: SmartToy,
  sections: AGENT_BUILDER_SECTIONS,
};

const MONITORING_GROUP: SectionGroupConfig = {
  key: 'monitoring',
  label: 'Monitoring',
  icon: Earthquake,
  sections: MONITORING_SECTIONS,
};

const SECTION_GROUPS = [AGENT_BUILDER_GROUP, MONITORING_GROUP];

const containsSection = (sections: DashboardSection[], key: string) =>
  sections.some(item => item.key === key);

const groupContainsTarget = (group: SectionGroupConfig, targetId: string) =>
  navTargetId(group.key) === targetId ||
  group.sections.some(item => navTargetId(item.key) === targetId);

interface NavItemProps {
  item: NavItemConfig;
  isActive: boolean;
  onNavigate: (key: string) => void;
}

function NavItem({ item, isActive, onNavigate }: Readonly<NavItemProps>) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => onNavigate(item.key)}
        isActive={isActive}
        tooltip={item.label}
        data-onboarding-id={navTargetId(item.key)}>
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

interface CollapsibleSectionProps {
  group: SectionGroupConfig;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activeKey: string;
  sidebarState: 'expanded' | 'collapsed';
  onExpand: () => void;
  onNavigate: (key: string) => void;
  isNamespaceResolved: boolean;
  loading: boolean;
}

function CollapsibleSection({
  group,
  isOpen,
  onOpenChange,
  activeKey,
  sidebarState,
  onExpand,
  onNavigate,
  isNamespaceResolved,
  loading,
}: Readonly<CollapsibleSectionProps>) {
  const Icon = group.icon;
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={containsSection(group.sections, activeKey)}
          tooltip={group.label}
          className="group/button"
          data-onboarding-id={navTargetId(group.key)}>
          <CollapsibleTrigger
            className="flex w-full items-center gap-2"
            onClick={e => {
              if (sidebarState === 'collapsed') {
                e.preventDefault();
                onExpand();
              }
            }}>
            <Icon />
            <span>{group.label}</span>
            <ChevronDown
              className={cn(
                'ml-auto h-3.5 w-3.5 shrink-0 transition-transform',
                isOpen && 'rotate-180',
              )}
            />
          </CollapsibleTrigger>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <CollapsibleContent>
        {group.sections.map(item => (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton
              data-onboarding-id={navTargetId(item.key)}
              onClick={() => isNamespaceResolved && onNavigate(item.key)}
              isActive={item.key === activeKey}
              disabled={!isNamespaceResolved || loading}>
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface CollapsibleGroupProps {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleGroup({
  label,
  defaultOpen = true,
  children,
}: Readonly<CollapsibleGroupProps>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="text-sidebar-foreground/70 hover:bg-stateslayer-overlay-hover flex w-full shrink-0 cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-normal outline-hidden transition-colors select-none group-data-[collapsible=icon]:hidden">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>{label}</span>
        </CollapsibleTrigger>
        <CollapsibleContent style={{ marginLeft: 0 }}>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { push: navigateTo } = useNamespacedNavigation();
  const pathname = usePathname();
  const { user } = useUser();
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();
  const isExperimentalDarkModeEnabled = useAtomValue(
    isExperimentalDarkModeEnabledAtom,
  );
  const setIsFilesBrowserAvailable = useSetAtom(isFilesBrowserAvailableAtom);
  const setStoredIsExperimentalDarkModeEnabled = useSetAtom(
    storedIsExperimentalDarkModeEnabledAtom,
  );

  const { namespace, isNamespaceResolved } = useNamespace();

  const [loading, setLoading] = useState(true);

  const currentSection = pathname.split('/')[1];

  const [openGroups, setOpenGroups] = useState<
    Record<SectionGroupKey, boolean>
  >(() => ({
    'agent-builder': containsSection(AGENT_BUILDER_SECTIONS, currentSection),
    monitoring: containsSection(MONITORING_SECTIONS, currentSection),
  }));
  const tourActiveSection = useAtomValue(tourActiveSectionAtom);

  const setGroupOpen = (key: SectionGroupKey, open: boolean) =>
    setOpenGroups(prev => ({ ...prev, [key]: open }));

  useEffect(() => {
    const checkFilesAPIHealth = async () => {
      try {
        const available =
          await proxyService.isServiceAvailable('file-gateway-api');
        setIsFilesBrowserAvailable(available);
      } catch (error) {
        console.error('Failed to check files API health:', error);
        setIsFilesBrowserAvailable(false);
      } finally {
        setLoading(false);
      }
    };

    checkFilesAPIHealth();
  }, [setIsFilesBrowserAvailable]);

  useEffect(() => {
    if (sidebarState === 'collapsed') {
      setOpenGroups({ 'agent-builder': false, monitoring: false });
    }
  }, [sidebarState]);

  useEffect(() => {
    if (!tourActiveSection) return;
    const target = SECTION_GROUPS.find(group =>
      groupContainsTarget(group, tourActiveSection),
    );
    if (!target) return;
    setSidebarOpen(true);
    setOpenGroups(prev => ({ ...prev, [target.key]: true }));
  }, [tourActiveSection, setSidebarOpen]);

  const navigateToSection = (sectionKey: string) => {
    trackEvent({
      name: 'nav_item_clicked',
      properties: {
        section: sectionKey,
        fromSection: currentSection,
      },
    });
    navigateTo(`/${sectionKey}`);
  };

  const isSidebarExpanded = sidebarState === 'expanded';
  const sidebarToggleLabel = isSidebarExpanded
    ? 'Collapse sidebar'
    : 'Expand sidebar';
  const themeLabel = isExperimentalDarkModeEnabled ? 'Dark mode' : 'Light mode';

  const renderNavItem = (item: NavItemConfig) => (
    <NavItem
      key={item.key}
      item={item}
      isActive={currentSection === item.key}
      onNavigate={navigateToSection}
    />
  );

  const renderSectionGroup = (group: SectionGroupConfig) => (
    <CollapsibleSection
      group={group}
      isOpen={openGroups[group.key]}
      onOpenChange={open => setGroupOpen(group.key, open)}
      activeKey={currentSection}
      sidebarState={sidebarState}
      onExpand={() => {
        setSidebarOpen(true);
        setTimeout(() => setGroupOpen(group.key, true), 100);
      }}
      onNavigate={navigateToSection}
      isNamespaceResolved={isNamespaceResolved}
      loading={loading}
    />
  );

  return (
    <div>
      <Sidebar
        collapsible="icon"
        className="border-stroke-active-inverse border-r-2">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="!p-0 group-data-[collapsible=icon]:!h-12">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Image
                    src={
                      isExperimentalDarkModeEnabled ? qbLogoDark : qbLogoLight
                    }
                    alt="ARK"
                    width={32}
                    height={28}
                  />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-sidebar-accent-foreground text-base font-medium tracking-wide">
                    ARK
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarMenu className="mt-2 group-data-[collapsible=icon]:hidden">
            <SidebarMenuItem>
              <div
                className="bg-surface-bg-tertiary flex flex-col items-start justify-center gap-0 rounded-none px-3 py-2"
                data-testid="namespace-display">
                <span className="text-fg-secondary text-xs leading-4">
                  Namespace
                </span>
                <span className="text-fg-primary truncate text-sm leading-5 tracking-[-0.028px]">
                  {namespace}
                </span>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden px-2">
          <ScrollArea className="-mx-2 flex min-h-0 flex-1 flex-col px-2">
            <CollapsibleGroup label="General" defaultOpen>
              <SidebarMenu className="pl-5 group-data-[collapsible=icon]:pl-0">
                {renderNavItem(HOME_ITEM)}
                {renderSectionGroup(AGENT_BUILDER_GROUP)}
                {BUILD_ITEMS.map(renderNavItem)}
                {renderSectionGroup(MONITORING_GROUP)}
                {renderNavItem(MARKETPLACE_ITEM)}
              </SidebarMenu>
            </CollapsibleGroup>

            <CollapsibleGroup label="Other" defaultOpen={false}>
              <SidebarMenu className="pl-5 group-data-[collapsible=icon]:pl-0">
                {OTHER_ITEMS.map(renderNavItem)}
              </SidebarMenu>
            </CollapsibleGroup>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2">
            <Separator className="my-2" />
            <SidebarMenu>
              {renderNavItem(SETTINGS_ITEM)}

              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Help">
                  <a
                    href="https://mckinsey.github.io/agents-at-scale-ark/"
                    target="_blank"
                    rel="noopener noreferrer">
                    <Help className="h-4 w-4" />
                    <span>Help</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() =>
                    setStoredIsExperimentalDarkModeEnabled(
                      !isExperimentalDarkModeEnabled,
                    )
                  }
                  tooltip={themeLabel}>
                  {isExperimentalDarkModeEnabled ? (
                    <Bedtime className="h-4 w-4" />
                  ) : (
                    <LightMode className="h-4 w-4" />
                  )}
                  <span>{themeLabel}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setSidebarOpen(!isSidebarExpanded)}
                  className="w-8 px-2"
                  tooltip={sidebarToggleLabel}
                  aria-label={sidebarToggleLabel}>
                  {isSidebarExpanded ? (
                    <KeyboardDoubleArrowLeft className="h-4 w-4" />
                  ) : (
                    <KeyboardDoubleArrowRight className="h-4 w-4" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>

          {user && (
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="h-12">
                      <UserDetails user={user} />
                      <UnfoldMore className="ml-auto h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="end"
                    className="w-[--radix-popper-anchor-width]">
                    <DropdownMenuLabel>
                      <UserDetails user={user} />
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signout}>
                      <Logout className="size-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}
