import { Sparkles } from 'lucide-react';
import Image from 'next/image';

import { auth } from '../auth';
import qbLogoLight from './img/qb-logo-light.svg';
import {
  fetchAccessibleNamespaces,
  type AccessibleNamespace,
} from './lib/namespaces';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Strip trailing slashes without a regex (avoids Sonar S5852 ReDoS heuristics).
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === '/') end -= 1;
  return value.slice(0, end);
}

function getNamespaceUrl(namespace: string): string {
  // Tenant dashboards are served per-namespace under a path prefix on the
  // shared dashboard origin (e.g. http://localhost:3000/tenant-a).
  const base = stripTrailingSlashes(
    process.env.NEXT_PUBLIC_ARK_DASHBOARD_URL || 'http://localhost:3000',
  );
  return `${base}/${namespace}`;
}

// Page copy is operator-customisable via env (read server-side at request time),
// falling back to these defaults.
function getCopy() {
  return {
    title: process.env.LANDING_PAGE_TITLE || 'ARK',
    subtitle:
      process.env.LANDING_PAGE_SUBTITLE || 'Agentic Runtime for Kubernetes',
    info:
      process.env.LANDING_PAGE_INFO ||
      'Access is evaluated from your identity and group membership. Ask a cluster administrator for a RoleBinding to see more.',
  };
}

export default async function LandingPage() {
  const { title: TITLE, subtitle: SUBTITLE, info: INFO } = getCopy();
  let namespaces: (AccessibleNamespace & { url: string })[] = [];
  try {
    const session = await auth();
    const user = session?.user as
      | { email?: string; groups?: string[] }
      | undefined;
    const found = await fetchAccessibleNamespaces({
      email: user?.email,
      groups: user?.groups,
    });
    namespaces = found.map((n) => ({
      ...n,
      // Prefer an explicit dashboard URL annotation; otherwise derive it.
      url: n.dashboardUrl || getNamespaceUrl(n.name),
    }));
  } catch (error) {
    console.error('Error fetching accessible namespaces:', error);
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
          <h1 className="text-5xl font-bold mb-4">{TITLE}</h1>
          <p className="text-xl text-muted-foreground mb-6">{SUBTITLE}</p>
          <div className="inline-block bg-muted border border-border px-6 py-3">
            <p className="text-sm text-muted-foreground">{INFO}</p>
          </div>
        </div>

        {namespaces.length === 0 ? (
          <div className="text-center text-muted-foreground">
            You don&apos;t have access to any ARK namespaces yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto place-items-center">
            {namespaces.map((ns) => (
              <a
                key={ns.name}
                href={ns.url}
                className="border border-border bg-card text-card-foreground hover:border-primary/50 hover:shadow-primary/10 p-8 cursor-pointer transition-all duration-200 hover:shadow-lg block group w-full max-w-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                    {ns.displayName}
                  </h2>
                  <Sparkles className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
                <p className="text-muted-foreground mb-6">
                  {ns.description || 'Open the ARK dashboard for this namespace'}
                </p>
                <div className="font-medium flex items-center gap-2 group-hover:text-primary transition-colors">
                  Open dashboard
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
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
