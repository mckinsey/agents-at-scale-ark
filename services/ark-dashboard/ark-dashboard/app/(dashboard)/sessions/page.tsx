import { PageHeader } from '@/components/common/page-header';

export default function SessionsPage() {
  return (
    <div className="bg-background min-h-screen">
      <PageHeader currentPage="Sessions" />
      <main className="container space-y-8 p-6 py-8">
        <section>
          <h2 className="mb-2 text-3xl font-bold text-balance">Sessions</h2>
          <p className="text-muted-foreground text-pretty">
            View and explore agentic workflow sessions with hierarchical tree views.
          </p>
        </section>
        {/* TODO: Add sessions list component */}
      </main>
    </div>
  );
}

