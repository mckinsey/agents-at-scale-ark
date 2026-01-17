'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import {
  AlertCircle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  ChevronsUpDownIcon,
  FlaskConical,
  Home,
  LogOut,
  Plus,
} from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  BROKER_FEATURE_KEY,
  FILES_BROWSER_FEATURE_KEY,
  isBrokerEnabledAtom,
  isExperimentalDarkModeEnabledAtom,
  isFilesBrowserAvailableAtom,
} from '@/atoms/experimental-features';
import { experimentalFeaturesDialogOpenAtom } from '@/atoms/internal-states';
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { trackEvent } from '@/lib/analytics/singleton';
import { signout } from '@/lib/auth/signout';
import {
  CONFIGURATION_SECTIONS,
  OPERATION_SECTIONS,
  RUNTIME_SECTIONS,
  SERVICE_SECTIONS,
} from '@/lib/constants/dashboard-icons';
import { type SystemInfo, systemInfoService } from '@/lib/services';
import { proxyService } from '@/lib/services/proxy';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useUser } from '@/providers/UserProvider';

import qbLogoDark from '../app/img/qb-logo-dark.svg';
import qbLogoLight from '../app/img/qb-logo-light.svg';
import { UserDetails } from './user';

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const isBrokerEnabled = useAtomValue(isBrokerEnabledAtom);
  const isExperimentalDarkModeEnabled = useAtomValue(
    isExperimentalDarkModeEnabledAtom,
  );
  const setExperimentalFeaturesDialogOpen = useSetAtom(
    experimentalFeaturesDialogOpenAtom,
  );
  const setIsFilesBrowserAvailable = useSetAtom(isFilesBrowserAvailableAtom);

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

  const enabledOperationSections = OPERATION_SECTIONS.filter(item => {
    switch (item.enablerFeature) {
      case BROKER_FEATURE_KEY:
        return isBrokerEnabled;
      case FILES_BROWSER_FEATURE_KEY:
        return true;
      default:
        return true;
    }
  });

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu
                // Dialog & DropdownMenu adds pointer-events: none
                // Discussion here: https://github.com/shadcn-ui/ui/discussions/6908
                modal={false}>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
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
                      <span className="font-medium">ARK Dashboard</span>
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
                  <DropdownMenuItem
                    onSelect={() => setExperimentalFeaturesDialogOpen(true)}>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Experimental Features
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => navigateToSection('')}
                isActive={getCurrentSection() === ''}>
                <Home />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarGroupLabel
                asChild
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm">
                <CollapsibleTrigger className="flex w-full items-center">
                  Configurations
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {CONFIGURATION_SECTIONS.map(item => {
                      const isPlaceholder = isPlaceholderSection(item.key);
                      const isDisabled =
                        !isNamespaceResolved || loading || isPlaceholder;
                      const isActive = getCurrentSection() === item.key;
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() =>
                              !isPlaceholder &&
                              isNamespaceResolved &&
                              navigateToSection(item.key)
                            }
                            isActive={isActive}
                            disabled={isDisabled}>
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarGroupLabel
                asChild
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm">
                <CollapsibleTrigger className="flex w-full items-center">
                  Runtime
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {RUNTIME_SECTIONS.map(item => {
                      const isPlaceholder = isPlaceholderSection(item.key);
                      const isDisabled =
                        !isNamespaceResolved || loading || isPlaceholder;
                      const isActive = getCurrentSection() === item.key;
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() =>
                              !isPlaceholder &&
                              isNamespaceResolved &&
                              navigateToSection(item.key)
                            }
                            isActive={isActive}
                            disabled={isDisabled}>
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarGroupLabel
                asChild
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm">
                <CollapsibleTrigger className="flex w-full items-center">
                  Operations
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {enabledOperationSections.map(item => {
                      const isPlaceholder = isPlaceholderSection(item.key);
                      const isDisabled =
                        !isNamespaceResolved || loading || isPlaceholder;
                      const isActive = getCurrentSection() === item.key;
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() =>
                              !isPlaceholder &&
                              isNamespaceResolved &&
                              navigateToSection(item.key)
                            }
                            isActive={isActive}
                            disabled={isDisabled}>
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>

          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarGroupLabel
                asChild
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm">
                <CollapsibleTrigger className="flex w-full items-center">
                  Service
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {SERVICE_SECTIONS.map(item => {
                      const isPlaceholder = isPlaceholderSection(item.key);
                      const isDisabled =
                        !isNamespaceResolved || loading || isPlaceholder;
                      const isActive = getCurrentSection() === item.key;
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() =>
                              !isPlaceholder &&
                              isNamespaceResolved &&
                              navigateToSection(item.key)
                            }
                            isActive={isActive}
                            disabled={isDisabled}>
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          {systemInfo && (
            <div className="text-muted-foreground px-2 py-2 text-xs">
              <p>
                ARK {systemInfo.system_version} (
                <a
                  href="/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline hover:text-blue-700">
                  APIs
                </a>
                )
              </p>
              <p>Kubernetes {systemInfo.kubernetes_version}</p>
            </div>
          )}
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
