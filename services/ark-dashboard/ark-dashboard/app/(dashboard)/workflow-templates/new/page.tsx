'use client';

import { RotateCcw, Save, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { WorkflowYamlEditor } from '@/components/workflow-authoring/workflow-yaml-editor';
import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useChatSession } from '@/lib/hooks';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import {
  extractWorkflowYaml,
  parseWorkflowTemplate,
} from '@/lib/utils/workflow-yaml';

const AUTHOR_AGENT = 'argo-make-author';

export default function NewWorkflowTemplatePage() {
  const {
    messages,
    isProcessing,
    processingPhase,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
  } = useChatSession({ name: AUTHOR_AGENT, type: 'agent' });

  const { push } = useNamespacedNavigation();

  const [draftYaml, setDraftYaml] = useState('');
  const [lastAgentYaml, setLastAgentYaml] = useState('');
  const [currentMessage, setCurrentMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find(m => m.role === 'assistant' && m.content);
    if (!lastAssistant?.content) return;

    const extracted = extractWorkflowYaml(lastAssistant.content);
    if (!extracted) return;
    if (!parseWorkflowTemplate(extracted)) return;

    setDraftYaml(extracted);
    setLastAgentYaml(extracted);
  }, [messages]);

  const handleSend = async () => {
    const text = currentMessage.trim();
    if (!text || isProcessing) return;
    setCurrentMessage('');
    inputRef.current?.focus();

    const grounded =
      draftYaml && draftYaml !== lastAgentYaml
        ? `The current workflow YAML is:\n\n\`\`\`yaml\n${draftYaml}\n\`\`\`\n\nApply this change: ${text}`
        : text;

    await sendMessage(grounded);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSave = async () => {
    const template = parseWorkflowTemplate(draftYaml);
    if (!template) {
      toast.error(
        'The draft is not a valid WorkflowTemplate yet — keep iterating with the agent or fix the YAML.',
      );
      return;
    }

    setIsSaving(true);
    try {
      await workflowTemplatesService.create(template);
      toast.success(`Saved workflow template "${template.metadata.name}"`);
      push(`/workflow-templates/${template.metadata.name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save workflow template',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          ...BASE_BREADCRUMBS,
          { label: 'Workflow Templates', href: '/workflow-templates' },
        ]}
        currentPage="New"
        actions={
          <Button
            onClick={handleSave}
            disabled={!draftYaml || isSaving || isProcessing}
            size="sm">
            <Save className="mr-1 h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 w-1/2 flex-col rounded-md border">
          <div
            className="flex-1 overflow-y-auto p-4"
            style={{ minHeight: 0 }}>
            {messages.length === 0 ? (
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>
                  Describe the workflow you want. The{' '}
                  <span className="font-mono">{AUTHOR_AGENT}</span> agent will
                  draft an Argo WorkflowTemplate, shown live on the right.
                </p>
                <p className="text-xs">
                  If nothing happens, install the agent:{' '}
                  <span className="font-mono">
                    kubectl apply -f
                    services/argo-workflows/samples/argo-make-author.yaml
                  </span>
                </p>
              </div>
            ) : (
              <ChatMessageList
                messages={messages}
                type="agent"
                debugMode
                isProcessing={isProcessing}
                processingPhase={processingPhase}
                error={error}
                viewMode="markdown"
                messagesEndRef={messagesEndRef}
              />
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2 border-t p-3">
            <Input
              ref={inputRef}
              placeholder={
                isProcessing ? 'Processing…' : 'Describe your workflow…'
              }
              value={currentMessage}
              onChange={e => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isProcessing}
            />
            <Button
              onClick={handleSend}
              disabled={!currentMessage.trim() || isProcessing}
              size="sm"
              aria-label="Send message">
              {isProcessing ? (
                <Square className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              disabled={isProcessing || messages.length === 0}
              aria-label="New conversation">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 w-1/2 flex-col rounded-md border">
          <Tabs defaultValue="dag" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-2 w-fit">
              <TabsTrigger value="dag">Diagram</TabsTrigger>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
            </TabsList>

            <TabsContent
              value="dag"
              className="min-h-0 flex-1 overflow-auto p-2">
              {draftYaml ? (
                <WorkflowDagViewer manifest={draftYaml} />
              ) : (
                <div className="text-muted-foreground p-4 text-sm">
                  The workflow diagram will appear here.
                </div>
              )}
            </TabsContent>

            <TabsContent value="yaml" className="min-h-0 flex-1 p-2">
              <WorkflowYamlEditor
                value={draftYaml}
                onChange={setDraftYaml}
                readOnly={isProcessing}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
