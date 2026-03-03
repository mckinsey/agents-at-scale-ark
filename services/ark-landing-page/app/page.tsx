import { Sparkles } from 'lucide-react';
import Image from 'next/image';
import qbLogoLight from './img/qb-logo-light.svg';
import { fetchDemos, type Demo } from './lib/demos';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getDemoUrl(demoName: string): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_ARK_DASHBOARD_URL || 'https://dashboard-demo.dev.agents-at-scale.com';

  const url = new URL(dashboardUrl);
  url.searchParams.set('namespace', demoName);
  return url.toString();
}

export default async function LandingPage() {
  let demos: (Demo & { url: string })[] = [];
  try {
    const baseDemos = await fetchDemos();
    demos = baseDemos.map(d => ({ ...d, url: getDemoUrl(d.name) }));
  } catch (error) {
    console.error('Error fetching demos:', error);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Image
              src={qbLogoLight}
              alt="QuantumBlack"
              width={48}
              height={42}
            />
          </div>
          <h1 className="text-5xl font-bold mb-4">
            ARK Demos
          </h1>
          <p className="text-xl text-muted-foreground mb-6">
            Explore agentic AI demonstrations
          </p>
          <div className="inline-block bg-muted border border-border px-6 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Demo Environment:</span> Each demo runs in its own isolated namespace with pre-loaded agents, teams, and models.
            </p>
          </div>
        </div>

        {demos.length === 0 ? (
          <div className="text-center text-muted-foreground">
            No demos available at the moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto place-items-center">
            {demos.map((demo) => (
              <a
                key={demo.name}
                href={demo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-border bg-card text-card-foreground hover:border-primary/50 hover:shadow-primary/10 p-8 cursor-pointer transition-all duration-200 hover:shadow-lg block group w-full max-w-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                    {demo.displayName}
                  </h2>
                  <Sparkles className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
                <p className="text-muted-foreground mb-6">
                  {demo.description || 'AI agent demonstration'}
                </p>
                <div className="font-medium flex items-center gap-2 group-hover:text-primary transition-colors">
                  Access Demo
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
