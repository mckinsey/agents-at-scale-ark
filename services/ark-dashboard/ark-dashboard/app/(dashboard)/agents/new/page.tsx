'use client';

import { Bot, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { AgentForm, AgentFormMode } from '@/components/forms/agent-form';

export default function AgentNewPage() {
  const router = useRouter();

  const onSuccess = useCallback(() => {
    toast.success('Agent Created', {
      description: (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span>Click on an agent to open Agent Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>Use the chat bubble for a quick conversation</span>
          </div>
        </div>
      ),
      duration: 8000,
    });

    router.push('/agents');
  }, [router]);

  return <AgentForm mode={AgentFormMode.CREATE} onSuccess={onSuccess} />;
}
