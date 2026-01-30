import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Parameter } from '@/components/ui/parameter-editor';
import type { Agent, AgentTool, Tool } from '@/lib/services';

interface AgentYamlViewProps {
  agent: Agent | null;
  description: string;
  modelName: string;
  modelNamespace: string;
  prompt: string;
  parameters: Parameter[];
  availableTools: Tool[];
  selectedTools: AgentTool[];
}

function generateAgentYaml({
  agent,
  description,
  modelName,
  modelNamespace,
  prompt,
  parameters,
  availableTools,
  selectedTools,
}: AgentYamlViewProps): string {
  if (!agent) return '';

  const selectedToolsList = availableTools.filter(t =>
    selectedTools.some(st => st.name === t.name),
  );

  const lines: string[] = [
    'apiVersion: ark.mckinsey.com/v1alpha1',
    'kind: Agent',
    'metadata:',
    `  name: ${agent.name}`,
    `  namespace: ${agent.namespace}`,
    'spec:',
  ];

  if (description) {
    lines.push(`  description: ${description}`);
  }

  if (modelName && modelName !== '__none__') {
    lines.push('  modelRef:');
    lines.push(`    name: ${modelName}`);
    if (modelNamespace) {
      lines.push(`    namespace: ${modelNamespace}`);
    }
  }

  if (prompt) {
    lines.push('  prompt: |');
    prompt.split('\n').forEach(line => {
      lines.push(`    ${line}`);
    });
  }

  if (parameters.length > 0) {
    lines.push('  parameters:');
    parameters.forEach(param => {
      lines.push(`    - name: ${param.name}`);
      if (param.value) {
        lines.push(`      value: ${param.value}`);
      }
    });
  }

  if (selectedToolsList.length > 0) {
    lines.push('  tools:');
    selectedToolsList.forEach(tool => {
      lines.push(`    - type: custom`);
      lines.push(`      name: ${tool.name}`);
    });
  }

  return lines.join('\n');
}

function copyToClipboard(text: string, onSuccess: () => void) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess);
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    onSuccess();
  }
}

function downloadYaml(yaml: string, filename: string) {
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AgentYamlView(props: AgentYamlViewProps) {
  const [copied, setCopied] = useState(false);
  const agentYaml = generateAgentYaml(props);

  const handleCopy = () => {
    copyToClipboard(agentYaml, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    downloadYaml(agentYaml, `${props.agent?.name || 'agent'}.yaml`);
  };

  return (
    <div className="relative h-full">
      <div className="absolute top-2 right-4 z-10 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1 px-2 text-xs">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="h-7 gap-1 px-2 text-xs">
          <Download className="h-3 w-3" />
          Download
        </Button>
      </div>
      <pre className="bg-muted/30 h-full overflow-auto p-4 pt-10 font-mono text-xs">
        {agentYaml}
      </pre>
    </div>
  );
}
