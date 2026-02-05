'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ChevronsUpDownIcon,
  File,
  HelpCircle,
  Home,
  ListTodo,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
  Server,
  Settings,
  Sun,
  Workflow,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  isExperimentalDarkModeEnabledAtom,
  isFilesBrowserAvailableAtom,
  storedIsExperimentalDarkModeEnabledAtom,
} from '@/atoms/experimental-features';
import { settingsModalOpenAtom } from '@/atoms/settings-modal';
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupLabel,
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
  MONITORING_SECTIONS,
} from '@/lib/constants/dashboard-icons';
import { type SystemInfo, systemInfoService } from '@/lib/services';
import { proxyService } from '@/lib/services/proxy';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useUser } from '@/providers/UserProvider';

import qbLogoDark from '../app/img/qb-logo-dark.svg';
import qbLogoLight from '../app/img/qb-logo-light.svg';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { UserDetails } from './user';
import { Separator } from './ui/separator';

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();
  const isExperimentalDarkModeEnabled = useAtomValue(
    isExperimentalDarkModeEnabledAtom,
  );
  const setSettingsModalOpen = useSetAtom(settingsModalOpenAtom);
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

  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [namespaceEditorOpen, setNamespaceEditorOpen] = useState(false);
  const [agentBuilderOpen, setAgentBuilderOpen] = useState(false);
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const isPlaceholderSection = (key: string): boolean => {
    const placeholderKeys: string[] = [];
    return placeholderKeys.includes(key);
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        // Load system info and get current context
        const systemData = await systemInfoService.get();
        setSystemInfo(systemData);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    const checkFilesAPIHealth = async () => {
      try {
        const available =
          await proxyService.isServiceAvailable('file-gateway-api');
        setIsFilesBrowserAvailable(available);
      } catch (error) {
        console.error('Failed to check files API health:', error);
        setIsFilesBrowserAvailable(false);
      }
    };

    loadInitialData();
    checkFilesAPIHealth();
  }, [router, pathname, setIsFilesBrowserAvailable]);

  useEffect(() => {
    const currentSection = pathname.split('/')[1];
    const isAgentBuilderSection = AGENT_BUILDER_SECTIONS.some(
      item => item.key === currentSection,
    );
    const isMonitoringSection =
      MONITORING_SECTIONS.some(item => item.key === currentSection) ||
      currentSection === 'evals';

    setAgentBuilderOpen(isAgentBuilderSection);
    setMonitoringOpen(isMonitoringSection);
  }, [pathname]);

  useEffect(() => {
    if (sidebarState === 'collapsed') {
      setAgentBuilderOpen(false);
      setMonitoringOpen(false);
    }
  }, [sidebarState]);

  const handleCreateNamespace = (name: string) => {
    createNamespace(name);
  };

  const navigateToSection = (sectionKey: string) => {
    trackEvent({
      name: 'nav_item_clicked',
      properties: {
        section: sectionKey,
        fromSection: getCurrentSection(),
      },
    });
    router.push(`/${sectionKey}`);
  };

  const getCurrentSection = () => {
    return pathname.split('/')[1];
  };

  const isAnySectionActive = (sections: typeof AGENT_BUILDER_SECTIONS) => {
    const currentSection = getCurrentSection();
    return sections.some(item => item.key === currentSection);
  };

  const enabledMonitoringSections = MONITORING_SECTIONS.filter(
    item => item.key !== 'evaluators' && item.key !== 'evaluations',
  );

  return (
    <>
      <Sidebar collapsible="icon" className="p-2">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none mb-4 !p-0">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Image
                    src={
                      isExperimentalDarkModeEnabled
                        ? qbLogoDark
                        : qbLogoLight
                    }
                    alt="ARK"
                    width={32}
                    height={32}
                  />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium text-sidebar-accent-foreground">ARK</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenu
          >
            <SidebarMenuItem>
              <DropdownMenu
                // Dialog & DropdownMenu adds pointer-events: none
                // Discussion here: https://github.com/shadcn-ui/ui/discussions/6908
                modal={false}>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground !p-0">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                      <Image
                        src={
                          isExperimentalDarkModeEnabled
                            ? qbLogoDark
                            : qbLogoLight
                        }
                        alt="ARK Dashboard Logo"
                        width={32}
                        height={32}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="font-medium text-sidebar-accent-foreground">ARK Dashboard</span>
                      <span className="text-xs">
                        {isPending
                          ? 'Loading...'
                          : availableNamespaces.length === 0
                            ? 'No namespaces'
                            : namespace}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto" />
                    {availableNamespaces.length === 0 && !loading && (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width]"
                  align="end"
                  side="right">
                  <DropdownMenuLabel>Namespaces</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {loading ? (
                    <DropdownMenuItem disabled>
                      Loading namespaces...
                    </DropdownMenuItem>
                  ) : availableNamespaces.length === 0 ? (
                    <DropdownMenuItem disabled>
                      No namespaces available
                    </DropdownMenuItem>
                  ) : (
                    <>
                      {availableNamespaces.map(ns => (
                        <DropdownMenuItem
                          key={ns.name}
                          onSelect={() => setNamespace(ns.name)}>
                          {ns.name}
                          {ns.name === namespace && (
                            <Check className="ml-auto h-4 w-4" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setNamespaceEditorOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Namespace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarMenu className='ml-2'>
          <SidebarContent>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => navigateToSection('')}
                isActive={getCurrentSection() === ''}>
                <Home />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <Collapsible
              open={agentBuilderOpen}
              onOpenChange={setAgentBuilderOpen}
              className="group/collapsible">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isAnySectionActive(AGENT_BUILDER_SECTIONS)}
                  tooltip="Agent Builder"
                  className="group/button">
                  <CollapsibleTrigger
                    className="flex w-full items-center gap-2"
                    onClick={(e) => {
                      if (sidebarState === 'collapsed') {
                        e.preventDefault();
                        setSidebarOpen(true);
                        setTimeout(() => setAgentBuilderOpen(true), 100);
                      }
                    }}>
                    <Bot />
                    <span>Agent Builder</span>
                    {agentBuilderOpen ? (
                      <ChevronUp className="ml-auto h-4 w-4 transition-opacity" />
                    ) : (
                      <ChevronDown className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover/button:opacity-100" />
                    )}
                  </CollapsibleTrigger>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <CollapsibleContent>
                {AGENT_BUILDER_SECTIONS.map(item => {
                  const isPlaceholder = isPlaceholderSection(item.key);
                  const isDisabled =
                    !isNamespaceResolved || loading || isPlaceholder;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        onClick={() =>
                          !isPlaceholder &&
                          isNamespaceResolved &&
                          navigateToSection(item.key)
                        }
                        disabled={isDisabled}>
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => navigateToSection('workflow-templates')}
                isActive={getCurrentSection() === 'workflow-templates'}>
                <Workflow />
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
                onClick={() => navigateToSection('models')}
                isActive={getCurrentSection() === 'models'}>
                <Zap />
                <span>Models</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <Collapsible
              open={monitoringOpen}
              onOpenChange={setMonitoringOpen}
              className="group/collapsible">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isAnySectionActive(MONITORING_SECTIONS)}
                  tooltip="Monitoring"
                  className="group/button">
                  <CollapsibleTrigger
                    className="flex w-full items-center gap-2"
                    onClick={(e) => {
                      if (sidebarState === 'collapsed') {
                        e.preventDefault();
                        setSidebarOpen(true);
                        setTimeout(() => setMonitoringOpen(true), 100);
                      }
                    }}>
                    <Activity />
                    <span>Monitoring</span>
                    {monitoringOpen ? (
                      <ChevronUp className="ml-auto h-4 w-4 transition-opacity" />
                    ) : (
                      <ChevronDown className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover/button:opacity-100" />
                    )}
                  </CollapsibleTrigger>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <CollapsibleContent>
                {enabledMonitoringSections.map(item => {
                  const isPlaceholder = isPlaceholderSection(item.key);
                  const isDisabled =
                    !isNamespaceResolved || loading || isPlaceholder;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        onClick={() =>
                          !isPlaceholder &&
                          isNamespaceResolved &&
                          navigateToSection(item.key)
                        }
                        disabled={isDisabled}>
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
            <SidebarMenuItem>
              <Popover open={morePopoverOpen} onOpenChange={setMorePopoverOpen}>
                <PopoverTrigger asChild>
                  <SidebarMenuButton isActive={morePopoverOpen}>
                    <MoreHorizontal />
                    <span>More</span>
                  </SidebarMenuButton>
                </PopoverTrigger>
                <PopoverContent
                  side="right"
                  align="start"
                  sideOffset={-110}
                  className="w-56 p-2">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        navigateToSection('files');
                        setMorePopoverOpen(false);
                      }}
                      className="hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                      <File className="h-4 w-4" />
                      <span>Files</span>
                    </button>
                    <button
                      onClick={() => {
                        navigateToSection('tasks');
                        setMorePopoverOpen(false);
                      }}
                      className="hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                      <ListTodo className="h-4 w-4" />
                      <span>A2A Tasks</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </SidebarMenuItem>
          </SidebarContent>
        </SidebarMenu>
        <SidebarContent></SidebarContent>
        <Separator className="!w-10 my-4" />
        <SidebarMenu className='ml-2'>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                setSettingsModalOpen(true);
              }}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                href="https://mckinsey.github.io/agents-at-scale-ark/"
                target="_blank"
                rel="noopener noreferrer">
                <HelpCircle className="mr-2 h-4 w-4" />
                <span>Help</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                setStoredIsExperimentalDarkModeEnabled(!isExperimentalDarkModeEnabled);
              }}>
              {isExperimentalDarkModeEnabled ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
              <span>{isExperimentalDarkModeEnabled ? 'Dark Mode' : 'Light Mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                setSidebarOpen(sidebarState === 'expanded' ? false : true);
              }}>
              {sidebarState === 'expanded' ? <ChevronsLeft className="mr-2 h-4 w-4" /> : <ChevronsRight className="mr-2 h-4 w-4" />}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarFooter>
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
        onSave={handleCreateNamespace}
      />
    </>
  );
}
