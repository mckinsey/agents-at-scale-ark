'use client';

import { Label } from '@radix-ui/react-label';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { AgentFields } from '../common/agent-fields';
import { HttpFields } from '../common/http-field';

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
  namespace,
}: Readonly<ToolEditorProps>) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const typeOptions = [
    { value: 'http', label: 'HTTP' },
    { value: 'mcp', label: 'MCP' },
    { value: 'agent', label: 'Agent' },
  ];
  const [description, setDescription] = useState('');
  const [inputSchema, setInputSchema] = useState('');
  const [annotations, setAnnotations] = useState('');
  const [isInputSchemaExpanded, setIsInputSchemaExpanded] = useState(false);
  const [isAnnotationsExpanded, setIsAnnotationsExpanded] = useState(false);

  // Additional fields state
  const [httpUrl, setHttpUrl] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');

  const isValid =
    name.trim() &&
    type.trim() &&
    description.trim().length > 0 &&
    inputSchema.trim().length > 0 &&
    (type !== 'agent' || selectedAgent.trim());

  const handleSave = () => {
    let parsedInputSchema: Record<string, unknown> | undefined;
    let parsedAnnotations: Record<string, string> | undefined;

    try {
      if (inputSchema.trim()) parsedInputSchema = JSON.parse(inputSchema);
    } catch {
      toast.error('Invalid Input Schema', {
        description: 'Input Schema must be valid JSON.',
      });
      return;
    }

    try {
      if (annotations.trim()) parsedAnnotations = JSON.parse(annotations);
    } catch {
      toast.error('Invalid Annotations', {
        description: 'Annotations must be valid JSON.',
      });
      return;
    }
    const toolSpec: ToolSpec = {
      name: name.trim(),
      type: type.trim(),
      description: description.trim(),
      inputSchema: parsedInputSchema,
      annotations: parsedAnnotations,
      ...(type === 'http' ? { url: httpUrl.trim() } : {}),
      ...(type === 'agent' ? { agent: selectedAgent.trim() } : {}),
    };

    onOpenChange(false);
    setName('');
    setType('');
    setDescription('');
    setInputSchema('');
    setAnnotations('');
    setHttpUrl('');
    setSelectedAgent('');
    setIsInputSchemaExpanded(false);
    setIsAnnotationsExpanded(false);
    onSave(toolSpec);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
              onChange={e => setName(e.target.value)}
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
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Tool description"
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="inputSchema">Input Schema (JSON)</Label>
              <div className="flex items-center gap-2">
                {inputSchema.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {inputSchema.length} characters
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setIsInputSchemaExpanded(!isInputSchemaExpanded)
                  }
                  className="h-8 px-2">
                  {isInputSchemaExpanded ? (
                    <>
                      <Minimize2 className="mr-1 h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <Maximize2 className="mr-1 h-4 w-4" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </div>
            <Textarea
              id="inputSchema"
              value={inputSchema}
              onChange={e => setInputSchema(e.target.value)}
              placeholder='e.g., {"param": "value"}'
              className={`resize-none transition-all duration-200 ${
                isInputSchemaExpanded
                  ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                  : 'max-h-[150px] min-h-[100px]'
              }`}
              style={{
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
              }}
            />
            {isInputSchemaExpanded && inputSchema.length > 0 && (
              <div className="text-muted-foreground text-xs">
                {inputSchema.split('\n').length} lines
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="annotations">Annotations (JSON)</Label>
              <div className="flex items-center gap-2">
                {annotations.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {annotations.length} characters
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setIsAnnotationsExpanded(!isAnnotationsExpanded)
                  }
                  className="h-8 px-2">
                  {isAnnotationsExpanded ? (
                    <>
                      <Minimize2 className="mr-1 h-4 w-4" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <Maximize2 className="mr-1 h-4 w-4" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </div>
            <Textarea
              id="annotations"
              value={annotations}
              onChange={e => setAnnotations(e.target.value)}
              placeholder='e.g., {"note": "important"}'
              className={`resize-none transition-all duration-200 ${
                isAnnotationsExpanded
                  ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                  : 'max-h-[150px] min-h-[100px]'
              }`}
              style={{
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
              }}
            />
            {isAnnotationsExpanded && annotations.length > 0 && (
              <div className="text-muted-foreground text-xs">
                {annotations.split('\n').length} lines
              </div>
            )}
          </div>
          {type === 'http' && <HttpFields url={httpUrl} setUrl={setHttpUrl} />}
          {type === 'agent' && (
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
