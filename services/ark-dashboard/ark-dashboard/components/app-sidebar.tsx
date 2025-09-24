"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { AlertCircle, Plus, ChevronRight, ChevronsUpDown, Check, ChevronsUpDownIcon, LogOut } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { CONFIGURATION_SECTIONS, OPERATION_SECTIONS, RUNTIME_SECTIONS } from "@/lib/constants/dashboard-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { systemInfoService, type SystemInfo } from "@/lib/services"
import { NamespaceEditor } from "@/components/editors"
import { UserDetails } from "./user"
import { signout } from "@/lib/auth/signout"
import { useNamespace } from "@/providers/NamespaceProvider"
import { useUser } from "@/providers/UserProvider"

export function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useUser()

  const {
    availableNamespaces,
    createNamespace,
    isPending,
    namespace,
    namespaceResolved,
    setNamespace
  } = useNamespace()
  
  const [loading, setLoading] = useState(true)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [namespaceEditorOpen, setNamespaceEditorOpen] = useState(false)

  const isPlaceholderSection = (key: string): boolean => {
    const placeholderKeys: string[] = []
    return placeholderKeys.includes(key)
  }

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      try {
        // Load system info and get current context
        const systemData = await systemInfoService.get()
        setSystemInfo(systemData)
      } catch (error) {
        console.error("Failed to load initial data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [router, pathname])

  const handleCreateNamespace = (name: string) => {
    createNamespace(name)
  }


  const navigateToSection = (sectionKey: string) => {
    router.push(`/${sectionKey}?namespace=${namespace}`)
  }

  const getCurrentSection = () => {
    const path = pathname.split('/')[1]
    return path || 'agents'
  }

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <div className="bg-white flex aspect-square size-8 items-center justify-center rounded-lg">
                      <Image src="/favicon.ico" alt="ARK" width={16} height={16} className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="font-medium">ARK Dashboard</span>
                      <span className="text-xs">
                        {isPending ? "Loading..." : availableNamespaces.length === 0 ? "No namespaces" : namespace}
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
                  side="right"
                >
                  <DropdownMenuLabel>Namespaces</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {loading ? (
                    <DropdownMenuItem disabled>Loading namespaces...</DropdownMenuItem>
                  ) : availableNamespaces.length === 0 ? (
                    <DropdownMenuItem disabled>No namespaces available</DropdownMenuItem>
                  ) : (
                    <>
                      {availableNamespaces.map(ns => (
                        <DropdownMenuItem
                          key={ns.name}
                          onSelect={() => setNamespace(ns.name)}
                        >
                          {ns.name}
                          {ns.name === namespace && <Check className="ml-auto h-4 w-4" />}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setNamespaceEditorOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Namespace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        
        <SidebarContent>
          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible">
              <SidebarGroupLabel
                asChild
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm"
              >
                <CollapsibleTrigger className="flex w-full items-center">
                  Configurations
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {CONFIGURATION_SECTIONS.map((item) => {
                      const isPlaceholder = isPlaceholderSection(item.key)
                      const isDisabled = !namespaceResolved || loading || isPlaceholder
                      const isActive = getCurrentSection() === item.key
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() => !isPlaceholder && namespaceResolved && navigateToSection(item.key)}
                            isActive={isActive}
                            disabled={isDisabled}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
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
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm"
              >
                <CollapsibleTrigger className="flex w-full items-center">
                  Runtime
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {RUNTIME_SECTIONS.map((item) => {
                      const isPlaceholder = isPlaceholderSection(item.key)
                      const isDisabled = !namespaceResolved || loading || isPlaceholder
                      const isActive = getCurrentSection() === item.key
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() => !isPlaceholder && namespaceResolved && navigateToSection(item.key)}
                            isActive={isActive}
                            disabled={isDisabled}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
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
                className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm"
              >
                <CollapsibleTrigger className="flex w-full items-center">
                  Operations
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {OPERATION_SECTIONS.map((item) => {
                      const isPlaceholder = isPlaceholderSection(item.key)
                      const isDisabled = !namespaceResolved || loading || isPlaceholder
                      const isActive = getCurrentSection() === item.key
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            onClick={() => !isPlaceholder && namespaceResolved && navigateToSection(item.key)}
                            isActive={isActive}
                            disabled={isDisabled}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </SidebarContent>
        
        <SidebarFooter>
          {systemInfo && (<div className="px-2 py-2 text-xs text-muted-foreground">
            <p>
              ARK {systemInfo.system_version} (
              <a 
                href="/api/docs" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 underline"
              >
                APIs
              </a>
              )
            </p>
            <p>Kubernetes {systemInfo.kubernetes_version}</p>
          </div>)}
          {user && (
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="h-12">
                      <UserDetails user={user}/>
                      <ChevronsUpDownIcon className="ml-auto"/>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="end"
                    className="w-[--radix-popper-anchor-width]"
                  >
                    <DropdownMenuLabel>
                      <UserDetails user={user}/>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator/>
                    <DropdownMenuItem onClick={signout}>
                      <LogOut/>
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
  )
}