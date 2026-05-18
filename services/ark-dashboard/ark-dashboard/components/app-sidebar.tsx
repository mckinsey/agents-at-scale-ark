'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDownIcon,
  Cog,
  Cpu,
  Database,
  Download,
  File,
  HelpCircle,
  Key,
  LayoutGrid,
  ListTodo,
  Lock,
  LogOut,
  Moon,
  Network,
  Plus,
  Server,
  Settings,
  Store,
  Sun,
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
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            {icon}
            <span>{label}</span>
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
        <CollapsibleTrigger className="text-sidebar-foreground/70 hover:bg-sidebar-accent flex h-8 w-full shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-sm font-normal outline-hidden transition-colors group-data-[collapsible=icon]:hidden">
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
                  <SidebarMenuButton className="bg-sidebar-accent/40 hover:bg-sidebar-accent relative flex h-12 flex-col items-start justify-center gap-0 px-3 py-1.5">
                    <span className="text-sidebar-foreground/60 text-[11px]">
                      Namespace
                    </span>
                    <div className="flex w-full items-center justify-between">
                      <span className="text-sidebar-foreground text-sm font-medium">
                        {namespaceLabel}
                      </span>
                      <ChevronsUpDownIcon className="text-sidebar-foreground/60 h-3.5 w-3.5" />
                    </div>
                    {availableNamespaces.length === 0 && !loading && (
                      <AlertCircle className="absolute right-2 top-2 h-4 w-4 text-red-500" />
                    )}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="bottom"
                  align="start"
                  className="bg-sidebar w-[--radix-popper-anchor-width] min-w-56">
                  <DropdownMenuLabel className="text-sidebar-foreground/60 text-xs font-normal">
                    Namespaces
                  </DropdownMenuLabel>
                  {namespaceOptions.map(ns => (
                    <DropdownMenuItem
                      key={ns.name}
                      onClick={() => setNamespace(ns.name)}
                      className={
                        ns.name === namespace
                          ? 'bg-sidebar-accent flex items-center justify-between'
                          : 'flex items-center justify-between'
                      }>
                      <span className="truncate">{ns.name}</span>
                      {ns.name === namespace && (
                        <Check className="text-sidebar-foreground h-4 w-4 shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  {namespaceOptions.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => setNamespaceEditorOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add namespace</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <CollapsibleGroup label="General" defaultOpen>
            <SidebarMenu className="pl-3">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('')}
                  isActive={getCurrentSection() === ''}>
                  <LayoutGrid />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <CollapsibleSection
                sections={AGENT_BUILDER_SECTIONS}
                isOpen={agentBuilderOpen}
                onOpenChange={setAgentBuilderOpen}
                icon={<Bot />}
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
                  isActive={getCurrentSection() === 'workflow-templates'}>
                  <Network />
                  <span>Workflows</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('mcp')}
                  isActive={getCurrentSection() === 'mcp'}>
                  <Server />
                  <span>MCPs</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('memory')}
                  isActive={getCurrentSection() === 'memory'}>
                  <Database />
                  <span>Memory</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('models')}
                  isActive={getCurrentSection() === 'models'}>
                  <Cpu />
                  <span>Models</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <CollapsibleSection
                sections={MONITORING_SECTIONS}
                isOpen={monitoringOpen}
                onOpenChange={setMonitoringOpen}
                icon={<Activity />}
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
                  isActive={getCurrentSection() === 'marketplace'}>
                  <Store />
                  <span>Marketplace</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </CollapsibleGroup>

          <CollapsibleGroup label="Other" defaultOpen={false}>
            <SidebarMenu className="pl-3">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('files')}
                  isActive={getCurrentSection() === 'files'}>
                  <File />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('a2a')}
                  isActive={getCurrentSection() === 'a2a'}>
                  <ListTodo />
                  <span>A2A</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('services')}
                  isActive={getCurrentSection() === 'services'}>
                  <Server />
                  <span>ARK Services</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('secrets')}
                  isActive={getCurrentSection() === 'secrets'}>
                  <Lock />
                  <span>Secrets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('api-keys')}
                  isActive={getCurrentSection() === 'api-keys'}>
                  <Key />
                  <span>API keys</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {isExperimentalExecutionEngineEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigateToSection('execution-engines')}
                    isActive={getCurrentSection() === 'execution-engines'}>
                    <Cog />
                    <span>Execution Engines</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('export')}
                  isActive={getCurrentSection() === 'export'}>
                  <Download />
                  <span>Exports</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </CollapsibleGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2">
            <Separator className="my-2" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigateToSection('settings')}
                  isActive={getCurrentSection() === 'settings'}>
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="https://mckinsey.github.io/agents-at-scale-ark/"
                    target="_blank"
                    rel="noopener noreferrer">
                    <HelpCircle className="h-4 w-4" />
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
                  }>
                  {isExperimentalDarkModeEnabled ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
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
                  className="w-8"
                  tooltip={
                    sidebarState === 'expanded'
                      ? 'Collapse sidebar'
                      : 'Expand sidebar'
                  }>
                  {sidebarState === 'expanded' ? (
                    <ChevronsLeft className="h-4 w-4" />
                  ) : (
                    <ChevronsRight className="h-4 w-4" />
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
                      <ChevronsUpDownIcon className="ml-auto" />
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
