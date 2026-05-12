'use client';

import { FileUp, Paperclip, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useChatSession } from '@/lib/hooks';
import {
  type ModelContextFile,
  modelContextFilesService,
} from '@/lib/services/model-context-files';

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const STORAGE_PREFIX = 'ark.file-assistant.files.';

function loadStoredFiles(agentName: string): ModelContextFile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + agentName);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as ModelContextFile[]) : [];
  } catch {
    return [];
  }
}

function saveStoredFiles(agentName: string, files: ModelContextFile[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (files.length === 0) {
      window.localStorage.removeItem(STORAGE_PREFIX + agentName);
    } else {
      window.localStorage.setItem(
        STORAGE_PREFIX + agentName,
        JSON.stringify(files),
      );
    }
  } catch {
    /* storage full or disabled — non-fatal */
  }
}

interface AgentFilePanelProps {
  /** Agent whose Model credentials upload/list/delete should resolve under. */
  agentName: string;
  /**
   * Agent the chat targets. Defaults to `agentName` when uploads and chat
   * share an agent (the standalone file-assistant case). When the dashboard
   * pairs a responses agent with a `<name>-files` sibling, the responses
   * agent goes here and the sibling on `agentName` — keeping uploads under
   * the sibling's executor while chat still hits the parent agent.
   */
  chatAgentName?: string;
}

export function AgentFilePanel({
  agentName,
  chatAgentName,
}: AgentFilePanelProps) {
  const chatTarget = chatAgentName ?? agentName;
  const [files, setFiles] = useState<ModelContextFile[]>(() =>
    loadStoredFiles(agentName),
  );
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    saveStoredFiles(agentName, files);
  }, [agentName, files]);
  const [uploading, setUploading] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isProcessing,
    processingPhase,
    error,
    sendMessage,
    messagesEndRef,
    messageTokenUsage,
  } = useChatSession({ name: chatTarget, type: 'agent' });

  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      setUploading(true);
      for (const file of Array.from(fileList)) {
        try {
          const uploaded = await modelContextFilesService.upload(file, {
            agentName,
          });
          setFiles(prev =>
            prev.some(f => f.id === uploaded.id) ? prev : [...prev, uploaded],
          );
          setSelectedFileIds(prev =>
            prev.includes(uploaded.id) ? prev : [...prev, uploaded.id],
          );
        } catch {
          console.error(`Failed to upload ${file.name}`);
        }
      }
      setUploading(false);
    },
    [agentName],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      try {
        await modelContextFilesService.delete(fileId, agentName);
      } catch {
        console.error(`Failed to delete ${fileId}`);
      }
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedFileIds(prev => prev.filter(id => id !== fileId));
    },
    [agentName],
  );

  const handleSend = async () => {
    if (!currentMessage.trim() || isProcessing) return;
    const msg = currentMessage.trim();
    setCurrentMessage('');
    await sendMessage(msg, { fileIds: selectedFileIds });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId],
    );
  };

  return (
    <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
        <ChatMessageList
          messages={messages}
          type="agent"
          debugMode={false}
          isProcessing={isProcessing}
          processingPhase={processingPhase}
          error={error}
          viewMode="markdown"
          messagesEndRef={messagesEndRef}
          messageTokenUsage={messageTokenUsage}
          hideEmptyState
        />
      </div>

      <div className="flex-shrink-0 border-t">
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
            {files.map(f => {
              const selected = selectedFileIds.includes(f.id);
              return (
                <span
                  key={f.id}
                  className={`group inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    selected
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border hover:bg-muted cursor-pointer'
                  }`}
                  onClick={() => toggleFileSelection(f.id)}
                  title={`${f.filename} · ${formatBytes(f.bytes)}`}>
                  <Paperclip className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{f.filename}</span>
                  <button
                    className="text-muted-foreground hover:text-destructive ml-0.5 opacity-60 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation();
                      deleteFile(f.id);
                    }}
                    aria-label={`Delete ${f.filename}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            {selectedFileIds.length > 0 && (
              <>
                <Separator orientation="vertical" className="mx-1 h-4" />
                <span className="text-muted-foreground text-xs">
                  {selectedFileIds.length} attached
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 text-xs"
                  onClick={() => setSelectedFileIds([])}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        )}

        <div
          className={`flex items-center gap-2 p-3 transition-colors ${
            dragOver ? 'bg-primary/5' : ''
          }`}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach files"
            title={uploading ? 'Uploading…' : 'Attach files'}>
            <FileUp className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Input
            ref={inputRef}
            placeholder={
              isProcessing
                ? 'Processing…'
                : dragOver
                  ? 'Drop files to upload…'
                  : `Ask ${chatTarget} about your files…`
            }
            value={currentMessage}
            onChange={e => setCurrentMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isProcessing}
          />
          <Button
            onClick={handleSend}
            disabled={!currentMessage.trim() || isProcessing}
            size="sm">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
