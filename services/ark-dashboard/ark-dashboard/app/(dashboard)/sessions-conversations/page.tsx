'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { Input } from '@/components/ui/input';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function SessionsConversationsPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex h-full flex-col space-y-4 p-8">
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Sessions"
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by session ID or participant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[400px] pl-10"
            />
          </div>
        }
      />
      <div>
        <h1 className="text-xl">Sessions</h1>
      </div>

      <div className="flex-1">
        <SessionsTable
          onSelectSession={setSelectedSessionId}
          selectedSessionId={selectedSessionId}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}
