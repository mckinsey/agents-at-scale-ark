'use client';

import { FileUp, Paperclip, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useChatSession } from '@/lib/hooks';
import {
  type ModelContextFile,
  modelContextFilesService,
} from '@/lib/services/model-context-files';
import type { AttachedFile } from '@/lib/types/chat-message';

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const STORAGE_PREFIX_LIBRARY = 'ark.file-assistant.files.';
const STORAGE_PREFIX_ATTACHED = 'ark.file-assistant.attached.';

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
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
    loadJSON<ModelContextFile[]>(STORAGE_PREFIX_LIBRARY + agentName, []),
  );
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    sessionId,
    isProcessing,
    processingPhase,
    error,
    sendMessage,
    messagesEndRef,
    messageTokenUsage,
  } = useChatSession({ name: chatTarget, type: 'agent' });

  const [attachedIds, setAttachedIds] = useState<string[]>(() =>
    loadJSON<string[]>(STORAGE_PREFIX_ATTACHED + sessionId, []),
  );

  useEffect(() => {
    saveJSON(STORAGE_PREFIX_LIBRARY + agentName, files);
  }, [agentName, files]);

  useEffect(() => {
    setAttachedIds(loadJSON<string[]>(STORAGE_PREFIX_ATTACHED + sessionId, []));
  }, [sessionId]);

  useEffect(() => {
    saveJSON(STORAGE_PREFIX_ATTACHED + sessionId, attachedIds);
  }, [sessionId, attachedIds]);

  // Hydrate library from the executor's per-agent index. The executor returns
  // the intersection of its index with OpenAI's current files, so cross-browser
  // uploads show up and pruned files drop out.
  useEffect(() => {
    let cancelled = false;
    modelContextFilesService
      .list(agentName)
      .then(server => {
        if (cancelled) return;
        setFiles(prev => {
          const byId = new Map<string, ModelContextFile>();
          for (const f of prev) byId.set(f.id, f);
          for (const f of server) byId.set(f.id, f);
          const serverIds = new Set(server.map(f => f.id));
          return Array.from(byId.values()).filter(f => serverIds.has(f.id));
        });
        setAttachedIds(prev => {
          const serverIds = new Set(server.map(f => f.id));
          return prev.filter(id => serverIds.has(id));
        });
      })
      .catch(() => {
        /* network error — keep whatever's in localStorage */
      });
    return () => {
      cancelled = true;
    };
  }, [agentName]);

  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      const items = Array.from(fileList);
      setPendingUploads(prev => [...prev, ...items.map(f => f.name)]);
      for (const file of items) {
        try {
          const uploaded = await modelContextFilesService.upload(file, {
            agentName,
          });
          setFiles(prev =>
            prev.some(f => f.id === uploaded.id) ? prev : [...prev, uploaded],
          );
          // Newly uploaded files auto-attach to the current conversation so
          // the user does not need a separate "attach" click for fresh files.
          setAttachedIds(prev =>
            prev.includes(uploaded.id) ? prev : [...prev, uploaded.id],
          );
        } catch {
          console.error(`Failed to upload ${file.name}`);
        } finally {
          setPendingUploads(prev => {
            const idx = prev.indexOf(file.name);
            if (idx === -1) return prev;
            const next = [...prev];
            next.splice(idx, 1);
            return next;
          });
        }
      }
    },
    [agentName],
  );

  const uploading = pendingUploads.length > 0;

  const deleteFile = useCallback(
    async (fileId: string) => {
      try {
        await modelContextFilesService.delete(fileId, agentName);
      } catch {
        console.error(`Failed to delete ${fileId}`);
      }
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setAttachedIds(prev => prev.filter(id => id !== fileId));
    },
    [agentName],
  );

  const toggleAttached = useCallback((fileId: string, checked: boolean) => {
    setAttachedIds(prev =>
      checked
        ? prev.includes(fileId)
          ? prev
          : [...prev, fileId]
        : prev.filter(id => id !== fileId),
    );
  }, []);

  const attachedFiles = useMemo<AttachedFile[]>(() => {
    const byId = new Map(files.map(f => [f.id, f.filename]));
    return attachedIds
      .filter(id => byId.has(id))
      .map(id => ({ id, filename: byId.get(id) as string }));
  }, [attachedIds, files]);

  const handleSend = async () => {
    if (!currentMessage.trim() || isProcessing) return;
    const msg = currentMessage.trim();
    setCurrentMessage('');
    await sendMessage(msg, {
      attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <Card className="flex h-full min-h-0 flex-1 flex-row overflow-hidden p-0">
      {/* Left column — chat */}
      <div className="flex min-w-0 flex-1 flex-col">
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
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
              <span className="text-muted-foreground mr-1 text-xs">
                Attached to conversation:
              </span>
              {attachedFiles.map(f => (
                <span
                  key={f.id}
                  className="bg-primary/10 border-primary/30 text-primary inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  title={`${f.filename} (${f.id})`}>
                  <Paperclip className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{f.filename}</span>
                </span>
              ))}
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
              aria-label="Upload files"
              title={uploading ? 'Uploading…' : 'Upload files'}>
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
      </div>

      {/* Right column — library */}
      <div className="bg-muted/30 flex h-full w-72 flex-shrink-0 flex-col border-l">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-xs font-semibold tracking-wide uppercase">
            Files
          </div>
          <span className="text-muted-foreground text-xs">
            {files.length}
            {attachedIds.length > 0 ? ` · ${attachedIds.length} attached` : ''}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {files.length === 0 && pendingUploads.length === 0 ? (
            <div className="text-muted-foreground p-4 text-xs">
              No files yet. Drop files in the chat or use the upload button —
              new uploads attach to this conversation automatically.
            </div>
          ) : (
            <ul className="divide-y">
              {pendingUploads.map((name, i) => (
                <li
                  key={`pending-${i}-${name}`}
                  className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
                  <Spinner size="sm" className="h-3 w-3" />
                  <span className="truncate">{name}</span>
                </li>
              ))}
              {files.map(f => {
                const attached = attachedIds.includes(f.id);
                return (
                  <li
                    key={f.id}
                    className="hover:bg-muted/50 group flex items-start gap-2 px-3 py-2">
                    <Checkbox
                      id={`file-attach-${f.id}`}
                      checked={attached}
                      onCheckedChange={c => toggleAttached(f.id, c)}
                      className="mt-1 flex-shrink-0"
                    />
                    <label
                      htmlFor={`file-attach-${f.id}`}
                      className="min-w-0 flex-1 cursor-pointer text-xs">
                      <div className="truncate font-medium" title={f.filename}>
                        {f.filename}
                      </div>
                      <div
                        className="text-muted-foreground truncate"
                        title={f.id}>
                        {f.id} · {formatBytes(f.bytes)}
                      </div>
                    </label>
                    <button
                      className="text-muted-foreground hover:text-destructive flex-shrink-0 opacity-60 group-hover:opacity-100"
                      onClick={() => deleteFile(f.id)}
                      aria-label={`Delete ${f.filename}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
