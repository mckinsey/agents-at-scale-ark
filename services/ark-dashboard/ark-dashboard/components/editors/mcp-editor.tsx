'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MCPServer, Secret } from '@/lib/services';
import { mcpServersService, secretsService } from '@/lib/services';
import type {
  DirectHeader,
  MCPHeader,
  MCPServerCreateRequest,
  SecretHeader,
} from '@/lib/services/mcp-servers';
import { getKubernetesNameError } from '@/lib/utils/kubernetes-validation';

import { ConditionalInputRow } from '../ui/conditionalInputRow';

interface McpEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpServer: MCPServer | null;
  onSave: (mcpSever: MCPServerCreateRequest, edit: boolean) => void;
  namespace: string;
}
type HeaderData = {
  key: string;
  name: string;
  type: 'direct' | 'secret';
  value: string;
};

export function McpEditor({
  open,
  onOpenChange,
  mcpServer,
  onSave,
  namespace,
}: McpEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [transport, setTransport] = useState<string>('http');
  const [headers, setHeaders] = useState<HeaderData[]>([
    { key: 'row-1', name: '', type: 'direct', value: '' },
  ]);

  const updateRow = (index: number, updated: Partial<HeaderData>) => {
    setHeaders(prev =>
      prev.map((row, i) => (i === index ? { ...row, ...updated } : row)),
    );
  };
  const generateUniqueKey = () => {
    const randomValue = window.crypto.getRandomValues(new Uint32Array(1))[0];
    const generatedSuffix = randomValue % 100000;
    return `row-${Date.now()}-${generatedSuffix}`;
  };

  const addRow = () => {
    setHeaders(prev => [
      ...prev,
      {
        key: generateUniqueKey(),
        name: '',
        type: 'direct',
        value: '',
      },
    ]);
  };

  const deleteRow = (key: string) => {
    const updatedHeaders = headers.filter(header => header.key !== key);
    setHeaders(updatedHeaders);
  };

  const getMpcServerDetails = useCallback(async () => {
    const mcpServerData = await mcpServersService.get(mcpServer?.name ?? '');
    setBaseUrl(mcpServerData?.address ?? '');
    setTransport(mcpServerData?.transport ?? 'http');
    setDescription(mcpServerData?.description ?? '');
    if (mcpServerData?.headers) {
      const transformedHeaders: HeaderData[] = mcpServerData?.headers?.map(
        (header: MCPHeader) => {
          const isSecret = 'valueFrom' in header.value;

          return {
            key: generateUniqueKey(),
            name: header.name,
            type: isSecret ? 'secret' : 'direct',
            value: isSecret
              ? (header as SecretHeader).value.valueFrom.secretKeyRef.name
              : (header as DirectHeader).value.value || '',
          };
        },
      );
      setHeaders(transformedHeaders);
    }
  }, [mcpServer?.name]);

  useEffect(() => {
    if (mcpServer && open) {
      setName(mcpServer.name);
      //setDescription(mcpServer.description ?? '');
      getMpcServerDetails();
    } else {
      setName('');
      setDescription('');
      setBaseUrl('');
    }
  }, [mcpServer, open, getMpcServerDetails]);

  const returnHeaderObj = (header: HeaderData): MCPHeader => {
    if (header.type === 'direct') {
      return {
        name: header.name,
        value: {
          value: header.value,
        },
      };
    } else {
      return {
        name: header.name,
        value: {
          valueFrom: {
            secretKeyRef: {
              name: header.value,
              key: 'token',
            },
          },
        },
      };
    }
  };

  const handleSave = () => {
    const modifiedHeaders: MCPHeader[] = headers.map(header => {
      return returnHeaderObj(header);
    });
    const createData: MCPServerCreateRequest = {
      name,
      namespace,
      spec: {
        description: description,
        transport,
        address: {
          value: baseUrl,
        },
        headers: modifiedHeaders,
      },
    };
    onSave(createData, !!mcpServer);
    onOpenChange(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value) {
      const error = getKubernetesNameError(value);
      setNameError(error);
    } else {
      setNameError(null);
    }
  };
  const [secrets, setSecrets] = useState<Secret[]>([]);

  // Fetch secrets when dialog opens
  useEffect(() => {
    if (open && namespace) {
      secretsService.getAll().then(setSecrets).catch(console.error);
    }
  }, [open, namespace]);

  const allFieldsFilled = headers.every(
    row => row.name.trim() !== '' && row.value.trim() !== '',
  );

  const isValid =
    name.trim() &&
    !nameError &&
    description.trim() &&
    baseUrl.trim() &&
    transport?.trim() &&
    allFieldsFilled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {mcpServer ? 'Edit Mcp Server' : 'Create New MCP Server'}
          </DialogTitle>
          <DialogDescription>
            {mcpServer
              ? 'Update the mcp server information below.'
              : 'Fill in the information for the new mcp server.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g., gpt-4-turbo"
              disabled={!!mcpServer}
              className={nameError ? 'border-red-500' : ''}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-500">{nameError}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g., This is a remote github mcp server"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="base-url">URL</Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https:/github.com/v1"
              disabled={!!mcpServer}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transport">Transport</Label>
            <Select
              value={transport}
              onValueChange={value => setTransport(value as 'http' | 'sse')}
              disabled={!!mcpServer}>
              <SelectTrigger id="transport">
                <SelectValue placeholder="Select a transport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">http</SelectItem>
                <SelectItem value="sse">sse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="base-url">Headers</Label>
            {headers.map((row, index) => (
              <ConditionalInputRow
                key={row.key}
                data={row}
                onChange={updated => updateRow(index, updated)}
                secrets={secrets}
                deleteRow={deleteRow}
              />
            ))}
            <Button onClick={() => addRow()} variant="outline" size="icon">
              <Plus className="h-2 w-2" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {mcpServer ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
