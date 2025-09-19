"use client"

import { useEffect, useState } from "react"
import { Plus, Copy, Check } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { apiKeysService, type APIKey, type APIKeyCreateResponse } from "@/lib/services"
import { AddAPIKeyDialog } from "@/components/dialogs/add-api-key-dialog"
import { APIKeyCreatedDialog } from "@/components/dialogs/api-key-created-dialog"
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog"

function DataTable({ 
  data, 
  onRevoke 
}: { 
  data: APIKey[]
  onRevoke: (apiKey: APIKey) => void
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = async (text: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(keyId)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Public Key</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((apiKey) => (
              <TableRow key={apiKey.id}>
                <TableCell className="font-medium">{apiKey.name}</TableCell>
                <TableCell className="font-mono text-sm">
                  <div className="flex items-center gap-2">
                    <span>{apiKey.public_key.substring(0, 20)}...</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(apiKey.public_key, apiKey.id)}
                          >
                            {copiedKey === apiKey.id ? 
                              <Check className="h-3 w-3" /> : 
                              <Copy className="h-3 w-3" />
                            }
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {copiedKey === apiKey.id ? "Copied!" : "Copy public key"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
                <TableCell>{new Date(apiKey.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  {apiKey.last_used_at 
                    ? new Date(apiKey.last_used_at).toLocaleString() 
                    : "Never"
                  }
                </TableCell>
                <TableCell>
                  {apiKey.expires_at 
                    ? new Date(apiKey.expires_at).toLocaleString() 
                    : "Never"
                  }
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => onRevoke(apiKey)}
                        >
                          Revoke
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Revoke and invalidate this API key
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No API keys found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function APIKeysContent() {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [createdApiKey, setCreatedApiKey] = useState<APIKeyCreateResponse | null>(null)
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [apiKeyToRevoke, setApiKeyToRevoke] = useState<APIKey | null>(null)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    const loadApiKeys = async () => {
      try {
        setLoading(true)
        const response = await apiKeysService.getAll()
        setApiKeys(response.items)
      } catch (err) {
        console.error("Failed to load API keys:", err)
        setError(err instanceof Error ? err.message : "Failed to load API keys")
      } finally {
        setLoading(false)
      }
    }

    loadApiKeys()
  }, [])

  const handleApiKeyCreated = (response: APIKeyCreateResponse) => {
    setCreatedApiKey(response)
    setSuccessDialogOpen(true)
    // Refresh the list
    const loadApiKeys = async () => {
      try {
        const response = await apiKeysService.getAll()
        setApiKeys(response.items)
      } catch (err) {
        console.error("Failed to refresh API keys:", err)
      }
    }
    loadApiKeys()
  }

  const handleRevoke = (apiKey: APIKey) => {
    setApiKeyToRevoke(apiKey)
    setRevokeDialogOpen(true)
  }

  const confirmRevoke = async () => {
    if (!apiKeyToRevoke) return

    try {
      setRevoking(true)
      await apiKeysService.delete(apiKeyToRevoke.public_key)
      
      // Remove from local state
      setApiKeys(prev => prev.filter(key => key.id !== apiKeyToRevoke.id))
      
      // Close dialog
      setRevokeDialogOpen(false)
      setApiKeyToRevoke(null)
      
    } catch (err) {
      console.error("Failed to revoke API key:", err)
      // TODO: Show error message to user
    } finally {
      setRevoking(false)
    }
  }

  if (loading) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Service API Keys</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="text-center py-8">
              Loading API keys...
            </div>
          </main>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Service API Keys</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-md p-4">
              <p className="font-medium">Error loading API keys</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </main>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Service API Keys</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <Button 
            size="sm"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add API Key
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <DataTable data={apiKeys} onRevoke={handleRevoke} />
        </main>
      </div>
      
      <AddAPIKeyDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleApiKeyCreated}
      />
      
      <APIKeyCreatedDialog
        open={successDialogOpen}
        onOpenChange={setSuccessDialogOpen}
        apiKey={createdApiKey}
      />
      
      <ConfirmationDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title="Revoke API Key"
        description={
          apiKeyToRevoke 
            ? `Revoke API key "${apiKeyToRevoke.name}" (${apiKeyToRevoke.public_key})? This action cannot be undone and will immediately invalidate the key.`
            : ""
        }
        confirmText={revoking ? "Revoking..." : "Revoke"}
        cancelText="Cancel"
        onConfirm={confirmRevoke}
        variant="destructive"
      />
    </>
  )
}

export default function APIKeysPage() {
  return (
    <div className="flex h-full flex-col">
      <APIKeysContent />
    </div>
  )
}
