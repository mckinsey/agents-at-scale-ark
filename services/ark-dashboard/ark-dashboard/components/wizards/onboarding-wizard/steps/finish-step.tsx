'use client';

import { useSetAtom } from 'jotai';
import { CheckCircle2, MessageSquare } from 'lucide-react';

import {
  onboardingWizardOpenAtom,
  storedOnboardingCompletedAtom,
} from '@/atoms/onboarding';
import { Button } from '@/components/ui/button';
import { openFloatingChat } from '@/lib/chat-events';

import { useWizard } from '../wizard-context';

export function FinishStep() {
  const { state, reset } = useWizard();
  const setOnboardingCompleted = useSetAtom(storedOnboardingCompletedAtom);
  const setWizardOpen = useSetAtom(onboardingWizardOpenAtom);

  const handleStartChatting = () => {
    setOnboardingCompleted(true);
    setWizardOpen(false);
    reset();
    if (state.createdAgentName) {
      openFloatingChat(state.createdAgentName, 'agent');
    }
  };

  const handleClose = () => {
    setOnboardingCompleted(true);
    setWizardOpen(false);
    reset();
  };

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium">You&apos;re All Set!</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Your AI infrastructure is ready to use.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4 text-left">
        <h4 className="font-medium">Resources Created:</h4>
        <ul className="space-y-2 text-sm">
          {state.createdModelName && (
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>
                Model:{' '}
                <code className="bg-muted rounded px-1">
                  {state.createdModelName}
                </code>
              </span>
            </li>
          )}
          {state.createdAgentName && (
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>
                Agent:{' '}
                <code className="bg-muted rounded px-1">
                  {state.createdAgentName}
                </code>
              </span>
            </li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-3 pt-4">
        <Button onClick={handleStartChatting} className="w-full">
          <MessageSquare className="mr-2 h-4 w-4" />
          Start Chatting with Your Agent
        </Button>
        <Button variant="outline" onClick={handleClose} className="w-full">
          Close
        </Button>
      </div>
    </div>
  );
}
