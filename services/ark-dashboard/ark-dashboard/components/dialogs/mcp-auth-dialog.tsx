'use client';

import { AlertCircle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { mcpServersService } from '@/lib/services/mcp-servers';
import type {
  AuthStartResponse,
  AuthStatusResponse,
} from '@/lib/services/mcp-servers';

interface McpAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpServerName: string;
  onSuccess?: () => void;
}

type FlowState = 'idle' | 'starting' | 'polling' | 'success' | 'failed' | 'expired';

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const MAX_POLL_ATTEMPTS = 150; // 5 minutes max (150 * 2s)

export function McpAuthDialog({
  open,
  onOpenChange,
  mcpServerName,
  onSuccess,
}: McpAuthDialogProps) {
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [authData, setAuthData] = useState<AuthStartResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [authWindow, setAuthWindow] = useState<Window | null>(null);

  // Cleanup function for auth window and polling
  const cleanup = () => {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
    }
    setAuthWindow(null);
    setPollAttempts(0);
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      cleanup();
      setFlowState('idle');
      setAuthData(null);
      setErrorMessage(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the OAuth flow
  const startAuth = async () => {
    setFlowState('starting');
    setErrorMessage(null);

    try {
      const response = await mcpServersService.authStart(mcpServerName);
      setAuthData(response);

      // Open authorization URL in a new window
      const newWindow = window.open(
        response.authorization_url,
        'mcp-oauth',
        'width=600,height=700,popup=yes',
      );

      if (!newWindow) {
        setErrorMessage(
          'Failed to open authorization window. Please allow popups for this site.',
        );
        setFlowState('failed');
        return;
      }

      setAuthWindow(newWindow);
      setFlowState('polling');
      setPollAttempts(0);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start authorization';
      setErrorMessage(message);
      setFlowState('failed');
    }
  };

  // Poll for auth status
  useEffect(() => {
    if (flowState !== 'polling' || !authData) {
      return;
    }

    const pollStatus = async () => {
      try {
        const status: AuthStatusResponse = await mcpServersService.authStatus(
          mcpServerName,
          authData.auth_id,
        );

        if (status.state === 'authorized') {
          setFlowState('success');
          cleanup();
          if (onSuccess) {
            setTimeout(onSuccess, 1000); // Small delay to show success message
          }
        } else if (status.state === 'failed') {
          setErrorMessage(status.message || 'Authorization failed');
          setFlowState('failed');
          cleanup();
        } else if (status.state === 'expired') {
          setErrorMessage(status.message || 'Authorization flow expired');
          setFlowState('expired');
          cleanup();
        } else {
          // Still pending, continue polling
          setPollAttempts(prev => prev + 1);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to check authorization status';
        setErrorMessage(message);
        setFlowState('failed');
        cleanup();
      }
    };

    // Check if we've exceeded max attempts
    if (pollAttempts >= MAX_POLL_ATTEMPTS) {
      setErrorMessage('Authorization timed out. Please try again.');
      setFlowState('failed');
      cleanup();
      return;
    }

    const timeoutId = setTimeout(pollStatus, POLL_INTERVAL_MS);

    return () => clearTimeout(timeoutId);
  }, [flowState, authData, mcpServerName, pollAttempts, onSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const getStatusContent = () => {
    switch (flowState) {
      case 'idle':
        return (
          <>
            <DialogDescription>
              This MCP server requires OAuth authorization. Click the button
              below to start the authorization flow in a new window.
            </DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={startAuth}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Authorize
              </Button>
            </DialogFooter>
          </>
        );

      case 'starting':
        return (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3">Starting authorization...</span>
          </div>
        );

      case 'polling':
        return (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">
                Complete authorization in the popup window
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                Waiting for you to complete the OAuth flow...
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                (Attempt {pollAttempts + 1} of {MAX_POLL_ATTEMPTS})
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cleanup();
                setFlowState('idle');
              }}
            >
              Cancel
            </Button>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <CheckCircle className="h-12 w-12 text-green-600" />
            <div className="text-center">
              <p className="font-medium">Authorization successful!</p>
              <p className="text-muted-foreground mt-2 text-sm">
                {mcpServerName} is now authorized
              </p>
            </div>
          </div>
        );

      case 'failed':
      case 'expired':
        return (
          <>
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <AlertCircle className="h-12 w-12 text-red-600" />
              <div className="text-center">
                <p className="font-medium">
                  Authorization {flowState === 'expired' ? 'expired' : 'failed'}
                </p>
                {errorMessage && (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setFlowState('idle');
                  setErrorMessage(null);
                }}
              >
                Try Again
              </Button>
            </DialogFooter>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Authorize MCP Server</DialogTitle>
        </DialogHeader>
        {getStatusContent()}
      </DialogContent>
    </Dialog>
  );
}
