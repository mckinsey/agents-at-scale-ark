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
import type { Secret } from "@/lib/services/secrets"
import { kubernetesNameSchema } from "@/lib/utils/kubernetes-validation"

interface SecretEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  secret: Secret | null
  onSave: (name: string, password: string) => void
  existingSecrets?: Secret[]
}

export function SecretEditor({ open, onOpenChange, secret, onSave, existingSecrets = [] }: SecretEditorProps) {
  const [name, setName] = useState(secret?.name || "")
  const [password, setPassword] = useState("")
  const [nameError, setNameError] = useState("")

  useEffect(() => {
    if (open) {
      setName(secret?.name || "")
      setPassword("")
      setNameError("")
    }
  }, [open, secret])

  const validateName = (value: string) => {
    // Check if name is empty
    if (!value.trim()) {
      setNameError("Name is required")
      return false
    }

    // Check Kubernetes naming rules
    if (!kubernetesNameSchema.safeParse(value).success) {
      setNameError("Name must consist of lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character (max 253 chars)")
      return false
    }

    // Check uniqueness (only for new secrets)
    if (!secret && existingSecrets.some(s => s.name === value)) {
      setNameError("A secret with this name already exists")
      return false
    }

    setNameError("")
    return true
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setName(value)
    if (value) {
      validateName(value)
    } else {
      setNameError("")
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate name before submitting
    if (!secret && !validateName(name)) {
      return
    }

    if (!password.trim()) {
      return
    }

    onSave(name, password)
    onOpenChange(false)
    setName("")
    setPassword("")
    setNameError("")
  }

  const isValid = (secret || (name && !nameError)) && password.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{secret ? "Edit Secret" : "Add Secret"}</DialogTitle>
            <DialogDescription>
              {secret ? "Update the password for this secret. The name cannot be changed." : "Enter the details for the new secret."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <div className="col-span-3 space-y-1">
                  <Input
                    id="name"
                    value={name}
                    onChange={handleNameChange}
                    placeholder="e.g. api-key-production"
                    required
                    disabled={!!secret}
                    className={nameError ? "border-red-500" : ""}
                  />
                  {nameError && (
                    <p className="text-xs text-red-500">{nameError}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="col-span-3"
                placeholder="Enter the secret password"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              {secret ? "Update Secret" : "Add Secret"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}