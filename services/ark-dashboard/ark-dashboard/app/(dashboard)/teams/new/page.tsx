'use client';

import { MessageCircle, Users } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { TeamForm, TeamFormMode } from '@/components/forms/team-form';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function TeamNewPage() {
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    toast.success('Team Created', {
      description: (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Click on a team to open Team Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>Use the chat bubble for a quick conversation</span>
          </div>
        </div>
      ),
      duration: 8000,
    });

    push('/teams');
  }, [push]);

  return <TeamForm mode={TeamFormMode.CREATE} onSuccess={onSuccess} />;
}
