'use client';

import copy from 'copy-to-clipboard';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Agent } from '@/lib/services';

import { getBashSnippet } from './code-snippets/bash-snippet';
import { getGoSnippet } from './code-snippets/go-snippet';
import { getPythonSnippet } from './code-snippets/python-snippet';

interface AgentsAPIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
}

export function AgentsAPIDialog({
  open,
  onOpenChange,
  agents,
}: AgentsAPIDialogProps) {
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Track user's explicit selection separately from the displayed selection
  const [userSelectedAgent, setUserSelectedAgent] = useState<string | null>(
    null,
  );

  // Derive the actual selected agent:
  // 1. Use user's selection if it exists and is still valid
  // 2. Otherwise use the first agent in the list
  // 3. Fall back to empty string if no agents exist
  const selectedAgent = (() => {
    if (userSelectedAgent && agents.some(a => a.name === userSelectedAgent)) {
      return userSelectedAgent;
    }
    return agents[0]?.name || '';
  })();

  const [activeTab, setActiveTab] = useState('python');
  const [isInternalEndpoint, setIsInternalEndpoint] = useState(false);

  const apiPath = '/api/openai/v1/chat/completions';
  const externalBaseUrl =
    typeof window !== 'undefined' ? window.location.origin : '';
  const internalBaseUrl = 'http://ark-api.<namespace>.svc.cluster.local';
  const fullEndpoint = isInternalEndpoint
    ? `${internalBaseUrl}${apiPath}`
    : `${externalBaseUrl}${apiPath}`;

  const copyToClipboard = (text: string, type: 'endpoint' | 'code') => {
    copy(text);
    if (type === 'endpoint') {
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const pythonCode = getPythonSnippet(fullEndpoint, selectedAgent);
  const goCode = getGoSnippet(fullEndpoint, selectedAgent);
  const bashCode = getBashSnippet(fullEndpoint, selectedAgent);

  const codeSnippets: Record<string, string> = {
    python: pythonCode,
    go: goCode,
    bash: bashCode,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-2xl overflow-y-auto sm:max-w-2xl md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>API Access</DialogTitle>
          <DialogDescription>
            Use the OpenAI-compatible API to chat with your agents from external
            systems.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Agent</label>
            <Select value={selectedAgent} onValueChange={setUserSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.name}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Endpoint</label>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="endpoint-toggle"
                  className="text-muted-foreground text-xs">
                  Cluster internal
                </Label>
                <Switch
                  id="endpoint-toggle"
                  checked={isInternalEndpoint}
                  onCheckedChange={setIsInternalEndpoint}
                />
              </div>
            </div>
            <div className="bg-muted flex items-center justify-between gap-2 overflow-hidden rounded-md p-3">
              <code className="overflow-x-auto text-sm">{fullEndpoint}</code>
              <Button
                size="sm"
                variant="ghost"
                className="flex-shrink-0"
                onClick={() => copyToClipboard(fullEndpoint, 'endpoint')}>
                {copiedEndpoint ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {isInternalEndpoint && (
              <p className="text-muted-foreground text-xs">
                Replace <code>&lt;namespace&gt;</code> with the namespace where
                Ark is deployed.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Code Examples</label>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="go">Go</TabsTrigger>
                  <TabsTrigger value="bash">Bash</TabsTrigger>
                </TabsList>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    copyToClipboard(codeSnippets[activeTab], 'code')
                  }>
                  {copiedCode ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <TabsContent value="python">
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                  {pythonCode}
                </pre>
              </TabsContent>
              <TabsContent value="go">
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                  {goCode}
                </pre>
              </TabsContent>
              <TabsContent value="bash">
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                  {bashCode}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
