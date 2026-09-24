'use client';

import { ChatNotice } from '@/components/chat/chat-notice';
import { Warning } from '@/components/icons';
import type { MemoryNotice } from '@/lib/services/chat';

// The condition's own message describes what happened to this query in the
// executor's words. It says nothing about what that means for the conversation
// the user is looking at, which is what the lead-in is for.
const MEMORY_NOTICE_LEAD: Record<MemoryNotice['type'], string> = {
  MemoryUnavailable: 'This chat is not keeping conversation history.',
  MemoryDegraded: 'Conversation history could not be read.',
};

interface MemoryChatNoticeProps {
  notice: MemoryNotice;
}

export function MemoryChatNotice({
  notice,
}: Readonly<MemoryChatNoticeProps>) {
  return (
    <ChatNotice icon={<Warning />} iconClassName="text-status-warning">
      {MEMORY_NOTICE_LEAD[notice.type]} {notice.message}
    </ChatNotice>
  );
}
