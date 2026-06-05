'use client';

import copy from 'copy-to-clipboard';
import { useEffect, useState } from 'react';

import { Check, ContentCopy } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Agent, agentsService } from '@/lib/services';

import { getBashSnippet } from './code-snippets/bash-snippet';
import { getGoSnippet } from './code-snippets/go-snippet';
import { getPythonSnippet } from './code-snippets/python-snippet';

interface AgentsAPIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const codeBlockClass =
  'bg-fill-onsurface-ui-2 text-fg-primary overflow-x-auto p-3 text-xs';

export function AgentsAPIDialog({ open, onOpenChange }: AgentsAPIDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [userSelectedAgent, setUserSelectedAgent] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState('python');
  const [isInternalEndpoint, setIsInternalEndpoint] = useState(false);

  useEffect(() => {
    if (!open) return;
    agentsService.getAll().then(setAgents).catch(console.error);
  }, [open]);

  const selectedAgent = (() => {
    if (userSelectedAgent && agents.some(a => a.name === userSelectedAgent)) {
      return userSelectedAgent;
    }
    return agents[0]?.name || '';
  })();

  const apiPath = '/api/v1/queries/';
  const externalBaseUrl =
    typeof window !== 'undefined' ? window.location.origin : '';
  const internalBaseUrl = 'http://ark-api.<namespace>.svc.cluster.local'; // NOSONAR - in-cluster service DNS; display-only example, never fetched; TLS terminates at ingress
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

  const agentItems = agents.map(a => ({ value: a.name, label: a.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl">
        <ScrollArea className="[&_[data-slot=scroll-area-viewport]]:max-h-[85vh]">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader>
              <DialogTitle>API Access</DialogTitle>
              <DialogDescription>
                Use the Query API to chat with your agents from external
                systems.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-fg-secondary text-sm">
                  Select Agent
                </Label>
                <Select
                  items={agentItems}
                  value={selectedAgent}
                  onValueChange={value =>
                    setUserSelectedAgent(value as string | null)
                  }>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentItems.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        <SelectItemText>{item.label}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-fg-secondary text-sm">Endpoint</Label>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="endpoint-toggle"
                      className="text-fg-secondary text-xs">
                      Cluster internal
                    </Label>
                    <Switch
                      id="endpoint-toggle"
                      checked={isInternalEndpoint}
                      onCheckedChange={setIsInternalEndpoint}
                    />
                  </div>
                </div>
                <div className="bg-fill-onsurface-ui-2 flex items-center justify-between gap-2 overflow-hidden p-3">
                  <code className="text-fg-primary overflow-x-auto text-sm">
                    {fullEndpoint}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    aria-label="Copy endpoint"
                    onClick={() => copyToClipboard(fullEndpoint, 'endpoint')}>
                    {copiedEndpoint ? (
                      <Check className="size-4" />
                    ) : (
                      <ContentCopy className="size-4" />
                    )}
                  </Button>
                </div>
                {isInternalEndpoint && (
                  <p className="text-fg-secondary text-xs">
                    Replace <code>&lt;namespace&gt;</code> with the namespace
                    where Ark is deployed.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-fg-secondary text-sm">
                  Code Examples
                </Label>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex items-center justify-between">
                    <TabsList>
                      <TabsTrigger value="python">Python</TabsTrigger>
                      <TabsTrigger value="go">Go</TabsTrigger>
                      <TabsTrigger value="bash">Bash</TabsTrigger>
                    </TabsList>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Copy code"
                      onClick={() =>
                        copyToClipboard(codeSnippets[activeTab], 'code')
                      }>
                      {copiedCode ? (
                        <Check className="size-4" />
                      ) : (
                        <ContentCopy className="size-4" />
                      )}
                    </Button>
                  </div>
                  <TabsContent value="python">
                    <pre className={codeBlockClass}>{pythonCode}</pre>
                  </TabsContent>
                  <TabsContent value="go">
                    <pre className={codeBlockClass}>{goCode}</pre>
                  </TabsContent>
                  <TabsContent value="bash">
                    <pre className={codeBlockClass}>{bashCode}</pre>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
