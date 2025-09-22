"use client"

import { useState, useEffect } from "react"
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
import { getKubernetesNameError } from "@/lib/utils/kubernetes-validation"

interface NamespaceEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
}

export function NamespaceEditor({ open, onOpenChange, onSave }: NamespaceEditorProps) {
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setNameError(null)
      setSaving(false)
    }
  }, [open])

  useEffect(() => {
    const error = getKubernetesNameError(name)
    setNameError(error)
  }, [name])

  const handleSave = async () => {
    if (nameError || !name.trim()) {
      return
    }

    setSaving(true)
    try {
      await onSave(name.trim())
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to create namespace:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !nameError && name.trim() && !saving) {
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Namespace</DialogTitle>
          <DialogDescription>
            Enter a name for the new Kubernetes namespace. The namespace name must be a valid DNS label.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <div className="col-span-3">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="my-namespace"
                className={nameError ? "border-red-500" : ""}
                disabled={saving}
              />
              {nameError && (
                <p className="text-sm text-red-500 mt-1">{nameError}</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!nameError || !name.trim() || saving}
          >
            {saving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}