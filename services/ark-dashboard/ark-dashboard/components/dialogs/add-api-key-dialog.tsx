"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiKeysService, type APIKeyCreateRequest, type APIKeyCreateResponse } from "@/lib/services"

interface AddAPIKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (response: APIKeyCreateResponse) => void
}

export function AddAPIKeyDialog({ open, onOpenChange, onSuccess }: AddAPIKeyDialogProps) {
  const [name, setName] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError("Name is required")
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const request: APIKeyCreateRequest = {
        name: name.trim(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
      }
      
      const response = await apiKeysService.create(request)
      
      // Reset form
      setName("")
      setExpiresAt("")
      
      // Close dialog and show success
      onOpenChange(false)
      onSuccess(response)
      
    } catch (err) {
      console.error("Failed to create API key:", err)
      setError(err instanceof Error ? err.message : "Failed to create API key")
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setName("")
    setExpiresAt("")
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for service-to-service authentication.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Enter a descriptive name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="expires-at">Expires At (optional)</Label>
            <Input
              id="expires-at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for no expiration
            </p>
          </div>
          
          {error && (
            <div className="text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full sm:w-auto"
            >
              {loading ? "Creating..." : "Create API Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
