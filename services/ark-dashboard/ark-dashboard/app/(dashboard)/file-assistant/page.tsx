'use client';

import { FileUp, Paperclip, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useChatSession } from '@/lib/hooks';

const FILE_API_URL =
  process.env.NEXT_PUBLIC_FILE_API_URL || '/api/v1/proxy/services/executor-openai-file-inputs:8000/';

const AGENT_NAME = 'file-assistant';

interface UploadedFile {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  status: string;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function FileAssistantPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
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
    clearChat,
    messagesEndRef,
    messageTokenUsage,
  } = useChatSession({ name: AGENT_NAME, type: 'agent' });

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`${FILE_API_URL}v1/files`);
      const data = await res.json();
      setFiles(data.data || []);
    } catch {
      console.error('Failed to load files');
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const uploadFiles = async (fileList: FileList) => {
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('purpose', 'user_data');
      try {
        const res = await fetch(`${FILE_API_URL}v1/files`, {
          method: 'POST',
          body: fd,
        });
        if (res.ok) {
          const uploaded = await res.json();
          setSelectedFileIds(prev => [...prev, uploaded.id]);
        }
      } catch {
        console.error(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    loadFiles();
  };

  const deleteFile = async (fileId: string) => {
    await fetch(`${FILE_API_URL}v1/files/${fileId}`, { method: 'DELETE' });
    setSelectedFileIds(prev => prev.filter(id => id !== fileId));
    loadFiles();
  };

  const handleSend = async () => {
    if (!currentMessage.trim() || isProcessing) return;
    const msg = currentMessage.trim();
    setCurrentMessage('');

    // TODO: pass selectedFileIds through query annotations once ark-sdk supports it
    // For now, include file references in the message text
    const fileContext =
      selectedFileIds.length > 0
        ? `\n\n[Attached files: ${selectedFileIds.join(', ')}]`
        : '';
    await sendMessage(msg + fileContext);
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
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId],
    );
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Agents', href: '/agents' }]}
        currentPage="File Assistant"
      />

      <div className="flex flex-1 gap-4 overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Left: File panel */}
        <Card className="flex w-80 flex-shrink-0 flex-col p-4">
          <h2 className="text-muted-foreground mb-3 text-sm font-medium uppercase tracking-wide">
            Files
          </h2>

          {/* Drop zone */}
          <div
            className={`mb-3 cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}>
            <FileUp className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
            <p className="text-muted-foreground text-xs">
              {uploading ? 'Uploading...' : 'Drop files or click to browse'}
            </p>
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
          </div>

          {/* File list */}
          <div className="flex-1 space-y-1 overflow-y-auto">
            {files.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-xs">No files uploaded</p>
            ) : (
              files.map(f => (
                <div
                  key={f.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer ${
                    selectedFileIds.includes(f.id)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted border border-transparent'
                  }`}
                  onClick={() => toggleFileSelection(f.id)}>
                  <Paperclip className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.filename}</p>
                    <p className="text-muted-foreground">{formatBytes(f.bytes)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation();
                      deleteFile(f.id);
                    }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {selectedFileIds.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {selectedFileIds.length} file{selectedFileIds.length > 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setSelectedFileIds([])}>
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Right: Chat panel */}
        <Card className="flex flex-1 flex-col p-0">
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
            />
          </div>

          <div className="flex-shrink-0 border-t">
            {selectedFileIds.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b px-4 py-2">
                {selectedFileIds.map(id => {
                  const file = files.find(f => f.id === id);
                  return (
                    <span
                      key={id}
                      className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                      <Paperclip className="h-3 w-3" />
                      {file?.filename || id}
                      <button
                        className="hover:text-destructive ml-0.5"
                        onClick={() => setSelectedFileIds(prev => prev.filter(fid => fid !== id))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 p-4">
              <Input
                ref={inputRef}
                placeholder={isProcessing ? 'Processing...' : 'Ask about your files...'}
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
      </div>
    </>
  );
}
