"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@radix-ui/react-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { HttpFields } from "../common/http-field";
import { AgentFields } from "../common/agent-fields";

interface ToolSpec {
  name: string;
  type: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, string>;
  url?: string;
  agent?: string;
}

interface ToolEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tool: ToolSpec) => void;
  namespace: string;
}

export function ToolEditor({
  open,
  onOpenChange,
  onSave,
  namespace
}: Readonly<ToolEditorProps>) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const typeOptions = [
    { value: "http", label: "HTTP" },
    { value: "mcp", label: "MCP" },
    { value: "agent", label: "Agent" }
  ];
  const [description, setDescription] = useState("");
  const [inputSchema, setInputSchema] = useState("");
  const [annotations, setAnnotations] = useState("");

  // Additional fields state
  const [httpUrl, setHttpUrl] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");

  const isValid = 
    name.trim() &&
    type.trim() &&
    description.trim().length > 0 &&
    inputSchema.trim().length > 0 &&
    (type !== "agent" || selectedAgent.trim());

  const handleSave = () => {
    let parsedInputSchema: Record<string, unknown> | undefined;
    let parsedAnnotations: Record<string, string> | undefined;

    try {
      if (inputSchema.trim()) parsedInputSchema = JSON.parse(inputSchema);
    } catch {
      toast({
        variant: "destructive", 
        title: "Invalid Input Schema",
        description: "Input Schema must be valid JSON."
      })
      return;
    }

    try {
      if (annotations.trim()) parsedAnnotations = JSON.parse(annotations);
    } catch {
      toast({
        variant: "destructive", 
        title: "Invalid Annotations",
        description: "Annotations must be valid JSON."
      })
      return;
    }
    const toolSpec: ToolSpec = {
      name: name.trim(),
      type: type.trim(),
      description: description.trim(),
      inputSchema: parsedInputSchema,
      annotations: parsedAnnotations,
      ...(type === "http" ? { url: httpUrl.trim() } : {}),
      ...(type === "agent" ? { agent: selectedAgent.trim() } : {})
    };

    onOpenChange(false);
    setName("");
    setType("");
    setDescription("");
    setInputSchema("");
    setAnnotations("");
    setHttpUrl("");
    setSelectedAgent("");
    onSave(toolSpec);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Tool</DialogTitle>
          <DialogDescription>
            Fill in the information for the new tool.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., search-tool"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tool description"
            />
          </div>
            <div className="grid gap-2">
              <Label htmlFor="inputSchema">Input Schema (JSON)</Label>
              <Textarea
                id="inputSchema"
                value={inputSchema}
                onChange={(e) => setInputSchema(e.target.value)}
                placeholder='e.g., {"param": "value"}'
                className="min-h-[100px]"
              />
            </div>
          <div className="grid gap-2">
            <Label htmlFor="annotations">Annotations (JSON)</Label>
            <Input
              id="annotations"
              value={annotations}
              onChange={(e) => setAnnotations(e.target.value)}
              placeholder='e.g., {"note": "important"}'
            />
          </div>
          {type === "http" && (
            <HttpFields url={httpUrl} setUrl={setHttpUrl} />
          )}
          {type === "agent" && (
            <AgentFields 
              selectedAgent={selectedAgent} 
              setSelectedAgent={setSelectedAgent}
              namespace={namespace}
              open={open}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
