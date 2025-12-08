'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader currentPage={`Session ${sessionId}`} />
      <main className="container space-y-8 p-6 py-8">
        <section>
          <h2 className="mb-2 text-3xl font-bold text-balance">
            Session {sessionId}
          </h2>
          <p className="text-muted-foreground text-pretty">
            Hierarchical view of queries, conversations, and events.
          </p>
        </section>
        {/* TODO: Add hierarchical tree component */}
      </main>
    </div>
  );
}

