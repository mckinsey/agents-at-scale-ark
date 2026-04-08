'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import {
  Activity,
  AlertCircle,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDownIcon,
  Cog,
  Download,
  File,
  HelpCircle,
  Home,
  ListTodo,
  LogOut,
  Moon,
  MoreHorizontal,
  Server,
  Settings,
  Store,
  Sun,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  isExperimentalDarkModeEnabledAtom,
  isExperimentalExecutionEngineEnabledAtom,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
            open={isOpen}
            className="flex w-full items-center gap-2"
            onClick={e => {
              if (sidebarState === 'collapsed') {
                e.preventDefault();
                onExpand();
              }
            }}>
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

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();
  const isExperimentalDarkModeEnabled = useAtomValue(
    isExperimentalDarkModeEnabledAtom,
  );
  const isExperimentalExecutionEngineEnabled = useAtomValue(
    isExperimentalExecutionEngineEnabledAtom,
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
  const [namespaceEditorOpen, setNamespaceEditorOpen] = useState(false);
  const [morePopoverOpen, setMorePopoverOpen] = useState(false);

  const currentSection = pathname.split('/')[1];
  const isAgentBuilderSection = AGENT_BUILDER_SECTIONS.some(
    item => item.key === currentSection,
  );
  const isMonitoringSection =
    MONITORING_SECTIONS.some(item => item.key === currentSection);

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
    router.push(`/${sectionKey}`);
  };

  const getCurrentSection = () => pathname.split('/')[1];

  const isAnySectionActive = (sections: DashboardSection[]) => {
    const current = getCurrentSection();
    return sections.some(item => item.key === current);
  };

  const enabledMonitoringSections = MONITORING_SECTIONS;

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
                    alt="QB Logo"
                    width={32}
                    height={28}
                  />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-sidebar-accent-foreground font-medium">
                    ARK Dashboard
                  </span>
                  <span className="text-xs">
                    {isPending
                      ? 'Loading...'
                      : availableNamespaces.length === 0
                        ? 'No namespaces'
                        : namespace}
                  </span>
                </div>
                {availableNamespaces.length === 0 && !loading && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="px-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => navigateToSection('')}
                isActive={getCurrentSection() === ''}>
                <Home />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <CollapsibleSection
              sections={AGENT_BUILDER_SECTIONS}
              isOpen={agentBuilderOpen}
              onOpenChange={setAgentBuilderOpen}
              icon={<Bot />}
              label="Agent Builder"
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
                onClick={() => navigateToSection('tools')}
                isActive={getCurrentSection() === 'tools'}>
                <Wrench />
                <span>Tools</span>
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

            <CollapsibleSection
              sections={enabledMonitoringSections}
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
                  sideOffset={sidebarState === 'expanded' ? -110 : 8}
                  className="w-56 p-2">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        navigateToSection('files');
                        setMorePopoverOpen(false);
                      }}
                      className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                      <File className="h-4 w-4" />
                      <span>Files</span>
                    </button>
                    <button
                      onClick={() => {
                        navigateToSection('tasks');
                        setMorePopoverOpen(false);
                      }}
                      className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                      <ListTodo className="h-4 w-4" />
                      <span>A2A Tasks</span>
                    </button>
                    {isExperimentalExecutionEngineEnabled && (
                      <button
                        onClick={() => {
                          navigateToSection('execution-engines');
                          setMorePopoverOpen(false);
                        }}
                        className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                        <Cog className="h-4 w-4" />
                        <span>Execution Engines</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        navigateToSection('export');
                        setMorePopoverOpen(false);
                      }}
                      className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                      <Download className="h-4 w-4" />
                      <span>Exports</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2">
            <Separator className="my-2 !w-10" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setSettingsModalOpen(true)}>
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
                  onClick={() =>
                    setStoredIsExperimentalDarkModeEnabled(
                      !isExperimentalDarkModeEnabled,
                    )
                  }>
                  {isExperimentalDarkModeEnabled ? (
                    <Sun className="mr-2 h-4 w-4" />
                  ) : (
                    <Moon className="mr-2 h-4 w-4" />
                  )}
                  <span>
                    {isExperimentalDarkModeEnabled ? 'Light Mode' : 'Dark Mode'}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="w-8 bg-[var(--primary-500)]">
                <SidebarMenuButton
                  onClick={() =>
                    setSidebarOpen(sidebarState === 'expanded' ? false : true)
                  }>
                  {sidebarState === 'expanded' ? (
                    <ChevronsLeft className="mr-2 h-4 w-4" />
                  ) : (
                    <ChevronsRight className="mr-2 h-4 w-4" />
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
