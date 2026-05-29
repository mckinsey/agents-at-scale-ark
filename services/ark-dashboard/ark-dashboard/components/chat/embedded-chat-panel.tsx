'use client';

import { Bug, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import { DebugStreamPanel } from '@/components/chat/debug-stream-panel';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type { GraphEdge } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';
type TabType = 'chat' | 'debug';

interface EmbeddedChatPanelProps {
  name: string;
  type: ChatType;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
}

export function EmbeddedChatPanel({
  name,
  type,
  strategy,
  selectorAgentName,
  graphEdges,
}: EmbeddedChatPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as TabType)}
        className="flex h-full flex-col">
        <div className="flex-shrink-0 border-b">
          <div className="flex items-center gap-2 px-4 py-3">
            <MessageCircle className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">Chat with {name}</span>
          </div>
          <TabsList className="mx-4 mb-2">
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="debug" className="gap-1.5">
              <Bug className="h-3.5 w-3.5" />
              Debug
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="mt-0 flex flex-1 flex-col overflow-hidden">
          <ChatPanel
            name={name}
            type={type}
            strategy={strategy}
            selectorAgentName={selectorAgentName}
            graphEdges={graphEdges}
          />
        </TabsContent>

        <TabsContent
          value="debug"
          className="mt-0 flex flex-1 flex-col overflow-hidden">
          <DebugStreamPanel name={name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
