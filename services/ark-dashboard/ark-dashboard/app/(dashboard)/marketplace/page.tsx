'use client';

import { Plus, Settings } from 'lucide-react';
import { useState } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { AddItemDialog } from '@/components/dialogs/add-item-dialog';
import { ManageMarketplaceDialog } from '@/components/dialogs/manage-marketplace-dialog';
import { MarketplaceSection } from '@/components/sections/marketplace-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function MarketplacePage() {
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Marketplace"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setManageDialogOpen(true)}>
              <Settings className="h-4 w-4" />
              Manage Marketplace
            </Button>
            <Button onClick={() => setAddItemDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Item to Marketplace
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 flex-col">
        <MarketplaceSection />
      </div>

      <AddItemDialog
        open={addItemDialogOpen}
        onOpenChange={setAddItemDialogOpen}
        onSuccess={() => setAddItemDialogOpen(false)}
      />

      <ManageMarketplaceDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />
    </>
  );
}
