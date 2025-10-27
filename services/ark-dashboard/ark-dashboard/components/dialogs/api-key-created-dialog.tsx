'use client';

import copy from 'copy-to-clipboard';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type APIKeyCreateResponse } from '@/lib/services';

interface APIKeyCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: APIKeyCreateResponse;
}

export function APIKeyCreatedDialog({
  open,
  onOpenChange,
  apiKey,
}: APIKeyCreatedDialogProps) {
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBoth, setCopiedBoth] = useState(false);

  const copyToClipboard = (
    text: string,
    type: 'public' | 'secret' | 'both',
  ) => {
    copy(text);

    if (type === 'public') {
      setCopiedPublic(true);
      setTimeout(() => setCopiedPublic(false), 2000);
    } else if (type === 'secret') {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedBoth(true);
      setTimeout(() => setCopiedBoth(false), 2000);
    }
  };

  const selectAllText = (e: React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  const handleClose = () => {
    setCopiedPublic(false);
    setCopiedSecret(false);
    setCopiedBoth(false);
    onOpenChange(false);
  };

  const bothCredentials = `Public Key: ${apiKey.public_key}\nSecret Key: ${apiKey.secret_key}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>API Key Created Successfully</DialogTitle>
          <DialogDescription>
            Your API key &ldquo;{apiKey.name}&rdquo; has been created. Save
            these credentials securely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertDescription className="text-amber-800">
              ⚠️ <strong>Important:</strong> The secret key will only be shown
              once. Save it securely now.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="public-key">Public Key</Label>
            <div className="flex gap-2">
              <Input
                id="public-key"
                value={apiKey.public_key}
                readOnly
                onClick={selectAllText}
                className="cursor-pointer font-mono text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(apiKey.public_key, 'public')}>
                {copiedPublic ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret-key">Secret Key</Label>
            <div className="flex gap-2">
              <Input
                id="secret-key"
                value={apiKey.secret_key}
                readOnly
                onClick={selectAllText}
                className="cursor-pointer font-mono text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(apiKey.secret_key, 'secret')}>
                {copiedSecret ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => copyToClipboard(bothCredentials, 'both')}
              className="flex-1">
              {copiedBoth ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Copy Both
            </Button>
            <Button onClick={handleClose} className="flex-1">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
