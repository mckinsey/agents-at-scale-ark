'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { AgentsAPIDialog } from './agents-api-dialog';

export function AgentsApiAccess() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Use via API
      </Button>
      <AgentsAPIDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
