'use client';

import { useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import { DebugStreamPanel } from '@/components/chat/debug-stream-panel';
import { BugReport, ChatBubble } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type { ParticipantType } from '@/lib/services/conversations';
import type { GraphEdge } from '@/lib/types/chat-message';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';

type ChatType = 'model' | 'team' | 'agent';
type TabType = 'chat' | 'debug';

function toParticipantType(type: ChatType): ParticipantType | undefined {
  if (type === 'agent' || type === 'team') return type;
  return undefined;
}

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
        <div className="bg-surface-bg-secondary border-stroke-tertiary flex-shrink-0 border-b">
          <div className="flex items-center gap-2 px-5 pt-4">
            <IconShell size="sm" className="opacity-100">
              {getParticipantIcon(toParticipantType(type), {
                size: '4',
                name,
              })}
            </IconShell>
            <span className="text-fg-primary text-base leading-6 font-semibold">
              {stripNamespace(name)}
            </span>
            <span className="text-fg-secondary text-sm leading-5 font-normal capitalize">
              {type}
            </span>
          </div>
          <TabsList className="mx-5 mt-2">
            <TabsTrigger value="chat" className="gap-1.5">
              <IconShell size="sm">
                <ChatBubble />
              </IconShell>
              Chat
            </TabsTrigger>
            <TabsTrigger value="debug" className="gap-1.5">
              <IconShell size="sm">
                <BugReport />
              </IconShell>
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
