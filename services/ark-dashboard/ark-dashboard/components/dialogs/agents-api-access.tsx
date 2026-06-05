'use client';

import { useState } from 'react';

import { Code } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';

import { AgentsAPIDialog } from './agents-api-dialog';

export function AgentsApiAccess() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IconShell size="sm" variant="secondary">
          <Code />
        </IconShell>
        Use via API
      </Button>
      <AgentsAPIDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
