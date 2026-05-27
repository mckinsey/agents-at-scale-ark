'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Cog,
  LogOut,
} from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  isExperimentalDarkModeEnabledAtom,
  isExperimentalExecutionEngineEnabledAtom,
  isFilesBrowserAvailableAtom,
  storedIsExperimentalDarkModeEnabledAtom,
} from '@/atoms/experimental-features';
import { NamespaceEditor } from '@/components/editors';
import {
  AccountTree,
  Add,
  Bedtime,
  Check,
  Dashboard,
  Database,
  Dns,
  Earthquake,
  Help,
  InsertDriveFile,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  LightMode,
  Memory,
  PlaylistAddCheck,
  PlugConnect,
  SaveAlt,
  Settings,
  Shield,
  SmartToy,
  Storefront,
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
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useGetAllNamespaces } from '@/lib/services/namespaces-hooks';
import { proxyService } from '@/lib/services/proxy';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useUser } from '@/providers/UserProvider';

import qbLogoDark from '../app/img/qb-logo-dark.svg';
import qbLogoLight from '../app/img/qb-logo-light.svg';
import { UserDetails } from './user';

interface CollapsibleSectionProps {
  sections: DashboardSection[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  sidebarState: 'expanded' | 'collapsed';
  onExpand: () => void;
  onNavigate: (key: string) => void;
  isNamespaceResolved: boolean;
  loading: boolean;
}

function CollapsibleSection({
  sections,
  isOpen,
  onOpenChange,
  icon,
  label,
  isActive,
  sidebarState,
  onExpand,
  onNavigate,
  isNamespaceResolved,
  loading,
}: CollapsibleSectionProps) {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={label}
          className="group/button">
          <CollapsibleTrigger
            className="flex w-full items-center gap-2"
            onClick={e => {
              if (sidebarState === 'collapsed') {
                e.preventDefault();
                onExpand();
              }
            }}>
            {icon}
            <span>{label}</span>
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
        {sections.map(item => (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton
              onClick={() => isNamespaceResolved && onNavigate(item.key)}
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
}: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="text-sidebar-foreground/70 hover:bg-sidebar-accent flex w-full shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-3 py-2 text-sm font-normal outline-hidden transition-colors group-data-[collapsible=icon]:hidden">
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
  const isExperimentalExecutionEngineEnabled = useAtomValue(
    isExperimentalExecutionEngineEnabledAtom,
  );
  const setIsFilesBrowserAvailable = useSetAtom(isFilesBrowserAvailableAtom);
  const setStoredIsExperimentalDarkModeEnabled = useSetAtom(
    storedIsExperimentalDarkModeEnabledAtom,
  );

  const {
    availableNamespaces,
    createNamespace,
    isPending,
    namespace,
    isNamespaceResolved,
    setNamespace,
  } = useNamespace();
  const { data: fetchedNamespaces } = useGetAllNamespaces();
  const namespaceOptions = fetchedNamespaces ?? availableNamespaces;

  const [loading, setLoading] = useState(true);
  const [namespaceEditorOpen, setNamespaceEditorOpen] = useState(false);

  const currentSection = pathname.split('/')[1];
  const isAgentBuilderSection = AGENT_BUILDER_SECTIONS.some(
    item => item.key === currentSection,
  );
  const isMonitoringSection = MONITORING_SECTIONS.some(
    item => item.key === currentSection,
  );

  const [agentBuilderOpen, setAgentBuilderOpen] = useState(
    isAgentBuilderSection,
  );
  const [monitoringOpen, setMonitoringOpen] = useState(isMonitoringSection);

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
      setAgentBuilderOpen(false);
      setMonitoringOpen(false);
    }
  }, [sidebarState]);

  const navigateToSection = (sectionKey: string) => {
    trackEvent({
      name: 'nav_item_clicked',
      properties: {
        section: sectionKey,
        fromSection: pathname.split('/')[1],
      },
    });
    const currentParams = new URLSearchParams(window.location.search);
    const queryString = currentParams.toString();
    const targetUrl = queryString
      ? `/${sectionKey}?${queryString}`
      : `/${sectionKey}`;
    navigateTo(targetUrl);
  };

  const getCurrentSection = () => pathname.split('/')[1];

  const isAnySectionActive = (sections: DashboardSection[]) => {
    const current = getCurrentSection();
    return sections.some(item => item.key === current);
  };

  const namespaceLabel = isPending
    ? 'Loading...'
    : availableNamespaces.length === 0
      ? 'No namespaces'
      : namespace;

  return (
    <div>
      <Sidebar collapsible="icon" className="p-2">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="bg-surface-bg-tertiary hover:bg-surface-bg-secondary relative flex h-auto flex-col items-start justify-center gap-0 rounded-none px-3 py-2">
                    <span className="text-fg-secondary text-xs leading-4">
                      Namespace
                    </span>
                    <div className="flex w-full items-center justify-between">
                      <span className="text-fg-primary truncate text-sm leading-5 tracking-[-0.028px]">
                        {namespaceLabel}
                      </span>
                      <UnfoldMore className="text-fg-secondary h-4 w-4 shrink-0" />
                    </div>
                    {availableNamespaces.length === 0 && !loading && (
                      <AlertCircle className="absolute right-2 top-2 h-4 w-4 text-red-500" />
                    )}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="bottom"
                  align="start"
                  className="bg-surface-bg-tertiary w-[--radix-popper-anchor-width] min-w-56 rounded-none border-0 p-1">
                  <DropdownMenuLabel className="text-fg-tertiary px-3 py-2 text-xs font-normal leading-4">
                    Namespaces
                  </DropdownMenuLabel>
                  {namespaceOptions.map(ns => (
                    <DropdownMenuItem
                      key={ns.name}
                      onClick={() => setNamespace(ns.name)}
                      className={cn(
                        'flex items-center justify-between rounded-none py-2 pl-3 pr-2',
                        ns.name === namespace &&
                          'bg-stateslayer-overlay-pressed',
                      )}>
                      <span className="text-fg-primary truncate text-sm leading-5 tracking-[-0.028px]">
                        {ns.name}
                      </span>
                      {ns.name === namespace && (
                        <Check className="text-fg-primary h-4 w-4 shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  {namespaceOptions.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => setNamespaceEditorOpen(true)}
                    className="flex h-9 items-center gap-2 rounded-none px-3 py-2">
                    <Add className="text-fg-secondary h-4 w-4 shrink-0" />
                    <span className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
                      Add namespace
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden px-2">
          <ScrollArea className="-mx-2 flex min-h-0 flex-1 flex-col px-2">
            <CollapsibleGroup label="General" defaultOpen>
            <SidebarMenu className="pl-5 group-data-[collapsible=icon]:pl-0">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('')}
                  isActive={getCurrentSection() === ''}
                  tooltip="Home">
                  <Dashboard />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <CollapsibleSection
                sections={AGENT_BUILDER_SECTIONS}
                isOpen={agentBuilderOpen}
                onOpenChange={setAgentBuilderOpen}
                icon={<SmartToy />}
                label="Agent builder"
                isActive={isAnySectionActive(AGENT_BUILDER_SECTIONS)}
                sidebarState={sidebarState}
                onExpand={() => {
                  setSidebarOpen(true);
                  setTimeout(() => setAgentBuilderOpen(true), 100);
                }}
                onNavigate={navigateToSection}
                isNamespaceResolved={isNamespaceResolved}
                loading={loading}
              />

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('workflow-templates')}
                  isActive={getCurrentSection() === 'workflow-templates'}
                  tooltip="Workflows">
                  <AccountTree />
                  <span>Workflows</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('mcp')}
                  isActive={getCurrentSection() === 'mcp'}
                  tooltip="MCPs">
                  <PlugConnect />
                  <span>MCPs</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('memory')}
                  isActive={getCurrentSection() === 'memory'}
                  tooltip="Memory">
                  <Database />
                  <span>Memory</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('models')}
                  isActive={getCurrentSection() === 'models'}
                  tooltip="Models">
                  <Memory />
                  <span>Models</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <CollapsibleSection
                sections={MONITORING_SECTIONS}
                isOpen={monitoringOpen}
                onOpenChange={setMonitoringOpen}
                icon={<Earthquake />}
                label="Monitoring"
                isActive={isAnySectionActive(MONITORING_SECTIONS)}
                sidebarState={sidebarState}
                onExpand={() => {
                  setSidebarOpen(true);
                  setTimeout(() => setMonitoringOpen(true), 100);
                }}
                onNavigate={navigateToSection}
                isNamespaceResolved={isNamespaceResolved}
                loading={loading}
              />

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('marketplace')}
                  isActive={getCurrentSection() === 'marketplace'}
                  tooltip="Marketplace">
                  <Storefront />
                  <span>Marketplace</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </CollapsibleGroup>

          <CollapsibleGroup label="Other" defaultOpen={false}>
            <SidebarMenu className="pl-5 group-data-[collapsible=icon]:pl-0">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('files')}
                  isActive={getCurrentSection() === 'files'}
                  tooltip="Files">
                  <InsertDriveFile />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('a2a')}
                  isActive={getCurrentSection() === 'a2a'}
                  tooltip="A2A">
                  <PlaylistAddCheck />
                  <span>A2A</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('services')}
                  isActive={getCurrentSection() === 'services'}
                  tooltip="ARK Services">
                  <Dns />
                  <span>ARK Services</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('secrets')}
                  isActive={getCurrentSection() === 'secrets'}
                  tooltip="Secrets">
                  <Shield />
                  <span>Secrets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('api-keys')}
                  isActive={getCurrentSection() === 'api-keys'}
                  tooltip="API keys">
                  <VpnKey />
                  <span>API keys</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isExperimentalExecutionEngineEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigateToSection('execution-engines')}
                    isActive={getCurrentSection() === 'execution-engines'}
                    tooltip="Execution Engines">
                    <Cog />
                    <span>Execution Engines</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('export')}
                  isActive={getCurrentSection() === 'export'}
                  tooltip="Exports">
                  <SaveAlt />
                  <span>Exports</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </CollapsibleGroup>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2">
            <Separator className="my-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('settings')}
                  isActive={getCurrentSection() === 'settings'}
                  tooltip="Settings">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

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
                  tooltip={
                    isExperimentalDarkModeEnabled ? 'Light mode' : 'Dark mode'
                  }>
                  {isExperimentalDarkModeEnabled ? (
                    <LightMode className="h-4 w-4" />
                  ) : (
                    <Bedtime className="h-4 w-4" />
                  )}
                  <span>
                    {isExperimentalDarkModeEnabled ? 'Light mode' : 'Dark mode'}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() =>
                    setSidebarOpen(sidebarState === 'expanded' ? false : true)
                  }
                  className="w-8 px-2"
                  tooltip={
                    sidebarState === 'expanded'
                      ? 'Collapse sidebar'
                      : 'Expand sidebar'
                  }>
                  {sidebarState === 'expanded' ? (
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
                      <LogOut />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarFooter>
      </Sidebar>

      <NamespaceEditor
        open={namespaceEditorOpen}
        onOpenChange={setNamespaceEditorOpen}
        onSave={createNamespace}
      />
    </div>
  );
}
