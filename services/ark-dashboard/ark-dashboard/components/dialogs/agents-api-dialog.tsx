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
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents[0]?.name || '',
  );
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

  const pythonCode = `import requests
from requests.auth import HTTPBasicAuth

response = requests.post(
    "${fullEndpoint}",
  
    # Uncomment to use auth with key pair
    # auth=HTTPBasicAuth(PUBLIC_KEY, SECRET_KEY),
    
    headers={
        "Content-Type": "application/json",
        # Uncomment to use auth with bearer token
        # "Authorization": "Bearer YOUR_TOKEN_HERE",
    },
    json={
        # Required: The agent to use (format: "agent/<name>")
        "model": "agent/${selectedAgent}",

        # Required: List of messages in the conversation
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello, how can you help me?"}
        ],

        # Optional: Enable streaming responses (default: false)
        "stream": False,

        # Optional: Sampling temperature 0-2, higher = more random (default: 1)
        "temperature": 1.0,

        # Optional: Maximum tokens to generate (default: model-dependent)
        "max_tokens": 1024,

        # Optional: Custom metadata to pass to the agent
        "metadata": {
            "sessionId": "my-session-id"
        }
    }
)

print(response.json())`;

  const goCode = `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	payload := map[string]interface{}{
		// Required: The agent to use (format: "agent/<name>")
		"model": "agent/${selectedAgent}",

		// Required: List of messages in the conversation
		"messages": []map[string]string{
			{"role": "system", "content": "You are a helpful assistant."},
			{"role": "user", "content": "Hello, how can you help me?"},
		},

		// Optional: Enable streaming responses (default: false)
		"stream": false,

		// Optional: Sampling temperature 0-2, higher = more random (default: 1)
		"temperature": 1.0,

		// Optional: Maximum tokens to generate (default: model-dependent)
		"max_tokens": 1024,

		// Optional: Custom metadata to pass to the agent
		"metadata": map[string]string{
			"sessionId": "my-session-id",
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "${fullEndpoint}", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	// Uncomment to use auth with key pair
	// req.SetBasicAuth("PUBLIC_KEY", "SECRET_KEY")
	// Uncomment to use auth with bearer token
	// req.Header.Set("Authorization", "Bearer YOUR_TOKEN_HERE")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	result, _ := io.ReadAll(resp.Body)
	fmt.Println(string(result))
}`;

  const bashCode = `curl -X POST "${fullEndpoint}" \\
  # Uncomment to use auth with key pair
  # -u PUBLIC_KEY:SECRET_KEY \\
  # Uncomment to use auth with bearer token
  # -H "Authorization: Bearer YOUR_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "agent/${selectedAgent}",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how can you help me?"}
    ],
    "stream": false,
    "temperature": 1.0,
    "max_tokens": 1024,
    "metadata": {
      "sessionId": "my-session-id"
    }
  }'

# Fields:
# - model (required): The agent to use, format "agent/<name>"
# - messages (required): List of messages with role (system/user/assistant) and content
# - stream (optional): Enable streaming responses, default false
# - temperature (optional): Sampling temperature 0-2, higher = more random, default 1
# - max_tokens (optional): Maximum tokens to generate
# - metadata (optional): Custom metadata to pass to the agent`;

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
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
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
                  {isInternalEndpoint ? 'Cluster internal' : 'External'}
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
