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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { secretsService, type Model, type Secret, type ModelCreateRequest, type ModelUpdateRequest } from "@/lib/services"
import { getKubernetesNameError } from "@/lib/utils/kubernetes-validation"

interface ModelEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: Model | null
  onSave: (model: ModelCreateRequest | (ModelUpdateRequest & { id: string })) => void
  namespace: string
}

export function ModelEditor({ open, onOpenChange, model, onSave, namespace }: ModelEditorProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<"openai" | "azure" | "bedrock">("openai")
  const [modelName, setModelName] = useState("")
  
  // Secret field for API key
  const [apiKeySecretName, setApiKeySecretName] = useState("")
  
  // Base URL as direct field
  const [baseUrl, setBaseUrl] = useState("")
  
  // Azure-specific fields
  const [azureApiVersion, setAzureApiVersion] = useState("")
  
  // Bedrock-specific fields
  const [bedrockRegion, setBedrockRegion] = useState("")
  const [bedrockModel, setBedrockModel] = useState("")
  const [bedrockAccessKeyIdSecretName, setBedrockAccessKeyIdSecretName] = useState("")
  const [bedrockSecretAccessKeySecretName, setBedrockSecretAccessKeySecretName] = useState("")
  
  // Available secrets
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [nameError, setNameError] = useState<string | null>(null)

  // Fetch secrets when dialog opens
  useEffect(() => {
    if (open && namespace) {
      secretsService.getAll().then(setSecrets).catch(console.error)
    }
  }, [open, namespace])

  useEffect(() => {
    if (model) {
      setName(model.name)
      setType(model.type)
      setModelName(model.model)
      // Extract config values
      if (model.type === "openai" && model.config?.openai) {
        const openaiConfig = model.config.openai as Record<string, unknown>
        // Extract secretKeyRef from apiKey ValueSource
        const apiKey = openaiConfig.apiKey as Record<string, unknown> | undefined
        const valueFrom = apiKey?.valueFrom as Record<string, unknown> | undefined
        const secretKeyRef = valueFrom?.secretKeyRef as Record<string, unknown> | undefined
        if (secretKeyRef?.name) {
          setApiKeySecretName(String(secretKeyRef.name))
        }
        // Extract direct baseUrl value
        const baseUrl = openaiConfig.baseUrl as Record<string, unknown> | undefined
        if (baseUrl?.value) {
          setBaseUrl(String(baseUrl.value))
        }
      } else if (model.type === "azure" && model.config?.azure) {
        const azureConfig = model.config.azure as Record<string, unknown>
        // Extract secretKeyRef from apiKey ValueSource
        const apiKey = azureConfig.apiKey as Record<string, unknown> | undefined
        const valueFrom = apiKey?.valueFrom as Record<string, unknown> | undefined
        const secretKeyRef = valueFrom?.secretKeyRef as Record<string, unknown> | undefined
        if (secretKeyRef?.name) {
          setApiKeySecretName(String(secretKeyRef.name))
        }
        // Extract direct baseUrl value
        const baseUrl = azureConfig.baseUrl as Record<string, unknown> | undefined
        if (baseUrl?.value) {
          setBaseUrl(String(baseUrl.value))
        }
        if (azureConfig.apiVersion) {
          const apiVersion = azureConfig.apiVersion;
          if (typeof apiVersion === 'object' && apiVersion !== null) {
            // Handle case where apiVersion is an object with a value property
            if ('value' in apiVersion && typeof apiVersion.value === 'string') {
              setAzureApiVersion(apiVersion.value);
            } else {
              console.warn('Unexpected apiVersion object format:', apiVersion);
              setAzureApiVersion('');
            }
          } else {
            // Handle case where apiVersion is a simple value
            setAzureApiVersion(String(apiVersion));
          }
        }
      } else if (model.type === "bedrock" && model.config?.bedrock) {
        const bedrockConfig = model.config.bedrock as Record<string, unknown>
        if (bedrockConfig.region) {
          setBedrockRegion(String(bedrockConfig.region))
        }
        if (bedrockConfig.modelArn) {
          setBedrockModel(String(bedrockConfig.modelArn))
        }
        // Extract secretKeyRef from accessKeyId ValueSource
        const accessKeyId = bedrockConfig.accessKeyId as Record<string, unknown> | undefined
        const accessKeyIdValueFrom = accessKeyId?.valueFrom as Record<string, unknown> | undefined
        const accessKeyIdSecretKeyRef = accessKeyIdValueFrom?.secretKeyRef as Record<string, unknown> | undefined
        if (accessKeyIdSecretKeyRef?.name) {
          setBedrockAccessKeyIdSecretName(String(accessKeyIdSecretKeyRef.name))
        }
        // Extract secretKeyRef from secretAccessKey ValueSource
        const secretAccessKey = bedrockConfig.secretAccessKey as Record<string, unknown> | undefined
        const secretAccessKeyValueFrom = secretAccessKey?.valueFrom as Record<string, unknown> | undefined
        const secretAccessKeySecretKeyRef = secretAccessKeyValueFrom?.secretKeyRef as Record<string, unknown> | undefined
        if (secretAccessKeySecretKeyRef?.name) {
          setBedrockSecretAccessKeySecretName(String(secretAccessKeySecretKeyRef.name))
        }
      }
    } else {
      setName("")
      setType("openai")
      setModelName("")
      setApiKeySecretName("")
      setBaseUrl("")
      setAzureApiVersion("")
      setBedrockRegion("")
      setBedrockModel("")
      setBedrockAccessKeyIdSecretName("")
      setBedrockSecretAccessKeySecretName("")
    }
  }, [model])


  const handleSave = () => {
    const config: ModelCreateRequest["config"] = {}
    
    if (type === "openai") {
      config.openai = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: apiKeySecretName,
              key: "token"
            }
          }
        },
        baseUrl: baseUrl
      }
    } else if (type === "azure") {
      config.azure = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: apiKeySecretName,
              key: "token"
            }
          }
        },
        baseUrl: baseUrl,
        ...(azureApiVersion && { apiVersion: azureApiVersion })
      }
    } else if (type === "bedrock") {
      config.bedrock = {
        ...(bedrockRegion && { region: bedrockRegion }),
        ...(bedrockModel && { modelArn: bedrockModel }),
        ...(bedrockAccessKeyIdSecretName && {
          accessKeyId: {
            valueFrom: {
              secretKeyRef: {
                name: bedrockAccessKeyIdSecretName,
                key: "accessKeyId"
              }
            }
          }
        }),
        ...(bedrockSecretAccessKeySecretName && {
          secretAccessKey: {
            valueFrom: {
              secretKeyRef: {
                name: bedrockSecretAccessKeySecretName,
                key: "secretAccessKey"
              }
            }
          }
        })
      }
    }
    
    if (model) {
      // Update existing model
      const updateData: ModelUpdateRequest & { id: string } = {
        id: model.id,
        model: modelName,
        config: Object.keys(config).length > 0 ? config : undefined
      }
      onSave(updateData)
    } else {
      // Create new model
      const createData: ModelCreateRequest = {
        name,
        type,
        model: modelName,
        config
      }
      onSave(createData)
    }
    
    onOpenChange(false)
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (value) {
      const error = getKubernetesNameError(value)
      setNameError(error)
    } else {
      setNameError(null)
    }
  }

  const isValid = name.trim() && !nameError && modelName.trim() && 
    ((type === "openai" || type === "azure") ? (apiKeySecretName.trim() && baseUrl.trim()) : 
     (type === "bedrock") ? (bedrockAccessKeyIdSecretName.trim() && bedrockSecretAccessKeySecretName.trim()) : true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{model ? "Edit Model" : "Create New Model"}</DialogTitle>
          <DialogDescription>
            {model ? "Update the model information below." : "Fill in the information for the new model."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., gpt-4-turbo"
              disabled={!!model}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError && (
              <p className="text-sm text-red-500 mt-1">{nameError}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as "openai" | "azure" | "bedrock")} disabled={!!model}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="azure">Azure OpenAI</SelectItem>
                <SelectItem value="bedrock">AWS Bedrock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder={type === "openai" ? "e.g., gpt-4-turbo-preview" : type === "azure" ? "e.g., gpt-4" : "e.g., anthropic.claude-v2"}
            />
          </div>
          
          {type === "openai" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="secret">Secret</Label>
                <Select value={apiKeySecretName} onValueChange={setApiKeySecretName}>
                  <SelectTrigger id="secret">
                    <SelectValue placeholder="Select a secret" />
                  </SelectTrigger>
                  <SelectContent>
                    {secrets.map((secret) => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base-url">Base URL</Label>
                <Input
                  id="base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </>
          )}
          
          {type === "azure" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="secret">Secret</Label>
                <Select value={apiKeySecretName} onValueChange={setApiKeySecretName}>
                  <SelectTrigger id="secret">
                    <SelectValue placeholder="Select a secret" />
                  </SelectTrigger>
                  <SelectContent>
                    {secrets.map((secret) => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="base-url">Base URL</Label>
                <Input
                  id="base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-resource.openai.azure.com/"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api-version">API Version (Optional)</Label>
                <Input
                  id="api-version"
                  value={azureApiVersion}
                  onChange={(e) => setAzureApiVersion(e.target.value)}
                  placeholder="2023-05-15"
                />
              </div>
            </>
          )}
          
          {type === "bedrock" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="access-key-secret">Access Key ID Secret</Label>
                <Select value={bedrockAccessKeyIdSecretName} onValueChange={setBedrockAccessKeyIdSecretName}>
                  <SelectTrigger id="access-key-secret">
                    <SelectValue placeholder="Select a secret for Access Key ID" />
                  </SelectTrigger>
                  <SelectContent>
                    {secrets.map((secret) => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="secret-access-key-secret">Secret Access Key Secret</Label>
                <Select value={bedrockSecretAccessKeySecretName} onValueChange={setBedrockSecretAccessKeySecretName}>
                  <SelectTrigger id="secret-access-key-secret">
                    <SelectValue placeholder="Select a secret for Secret Access Key" />
                  </SelectTrigger>
                  <SelectContent>
                    {secrets.map((secret) => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="region">Region (Optional)</Label>
                <Input
                  id="region"
                  value={bedrockRegion}
                  onChange={(e) => setBedrockRegion(e.target.value)}
                  placeholder="us-east-1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bedrock-model">Model ARN (Optional)</Label>
                <Input
                  id="bedrock-model"
                  value={bedrockModel}
                  onChange={(e) => setBedrockModel(e.target.value)}
                  placeholder="arn:aws:bedrock:..."
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {model ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}