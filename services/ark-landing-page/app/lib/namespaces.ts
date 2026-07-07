import * as fs from 'fs';
import * as https from 'https';

import * as k8s from '@kubernetes/client-node';

export interface AccessibleNamespace {
  name: string;
  displayName: string;
  description?: string;
  // Explicit dashboard URL from annotation; when unset the page falls back to
  // deriving it from the namespace name.
  dashboardUrl?: string;
}

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

// Namespace annotations used for the display name / description / dashboard URL,
// each with a fallback when unset.
const DISPLAY_NAME_ANNOTATION = 'ark.mckinsey.com/display-name';
const DESCRIPTION_ANNOTATION = 'ark.mckinsey.com/namespace-description';
const DASHBOARD_URL_ANNOTATION = 'ark.mckinsey.com/dashboard-url';

// Per-SSAR socket timeout. Without this a stalled apiserver connection never
// settles the request Promise and the whole page hangs. On timeout we treat the
// namespace as not-accessible (resolve false) rather than blocking the page.
const SSAR_TIMEOUT_MS = Number(process.env.ARK_SSAR_TIMEOUT_MS) || 5000;

// Max in-flight SelfSubjectAccessReviews. The page issues one SSAR per candidate
// namespace; on a large cluster firing them all at once (Promise.all) hammers the
// apiserver. Bound the fan-out with a small worker pool.
const SSAR_CONCURRENCY = Number(process.env.ARK_SSAR_CONCURRENCY) || 8;

// Per-identity result cache TTL. The page is force-dynamic (per-user), so without
// this the full fan-out re-runs on every load. This only gates the hub's card
// list — access is still enforced downstream by the dashboard/api — so a short
// staleness window is acceptable. Set to 0 to disable caching.
const CACHE_TTL_MS = Number(process.env.ARK_NAMESPACE_CACHE_TTL_MS ?? 30000);

// Optional label selector applied to the namespace listing, so operators on large
// clusters can restrict candidates to ARK tenant namespaces server-side (e.g.
// "ark.mckinsey.com/tenant=true"). Default unset => list all namespaces (previous
// behavior), so this is opt-in and never hides a namespace a user could access.
const NAMESPACE_SELECTOR = process.env.ARK_TENANT_NAMESPACE_SELECTOR?.trim();

// Identity to impersonate, sourced from the (server-side) session — email and
// groups only, never the raw access token.
export interface UserIdentity {
  email?: string;
  groups?: string[];
}

interface CacheEntry {
  expires: number;
  value: AccessibleNamespace[];
}

// Module-level cache keyed by the impersonated identity. Persists across requests
// within a server process (each pod has its own); entries expire after CACHE_TTL_MS.
const namespaceCache = new Map<string, CacheEntry>();

function identityKey(email: string, groups: string[]): string {
  // Sort groups so membership order doesn't fragment the cache. Explicit
  // comparator (Sonar S2871) — any stable order works for a cache key.
  return `${email}\n${[...groups].sort((a, b) => a.localeCompare(b)).join(',')}`;
}

// Exposed for tests; also handy if a future signal (e.g. RoleBinding webhook)
// wants to invalidate proactively.
export function clearNamespaceCache(): void {
  namespaceCache.clear();
}

// Run `fn` over `items` with at most `limit` concurrent executions. Results are
// written by index so ordering is preserved. A worker pool (not chunked batching)
// keeps all lanes busy — one slow item can't stall a whole batch.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const size = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

// Ask the API server (as the impersonated user) whether they may list agents in
// `namespace`. Uses a raw request so we can send one `Impersonate-Group` header
// per group (Node emits repeated headers for array values) — the same multi-group
// correctness the ark-api fix restores.
function canListAgents(
  server: string,
  agent: https.Agent,
  saToken: string,
  email: string,
  groups: string[],
  namespace: string,
): Promise<boolean> {
  const headers: Record<string, string | string[]> = {
    Authorization: `Bearer ${saToken}`,
    'Content-Type': 'application/json',
    'Impersonate-User': email,
  };
  if (groups.length) headers['Impersonate-Group'] = groups;

  const body = JSON.stringify({
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        namespace,
        group: 'ark.mckinsey.com',
        resource: 'agents',
        verb: 'list',
      },
    },
  });

  return new Promise((resolve) => {
    const req = https.request(
      `${server}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
      { method: 'POST', agent, headers, timeout: SSAR_TIMEOUT_MS },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data)?.status?.allowed === true);
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    // Socket idle past SSAR_TIMEOUT_MS: abort and treat as not-accessible so one
    // slow apiserver response can't hang the page.
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

export async function fetchAccessibleNamespaces(
  identity: UserIdentity,
): Promise<AccessibleNamespace[]> {
  const email = identity.email;
  const groups = identity.groups ?? [];
  if (!email) return [];

  const key = identityKey(email, groups);
  if (CACHE_TTL_MS > 0) {
    const hit = namespaceCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
  }

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const cluster = kc.getCurrentCluster();
  if (!cluster?.server) return [];

  const saToken = fs.readFileSync(`${SA_DIR}/token`, 'utf8').trim();
  const ca = fs.readFileSync(`${SA_DIR}/ca.crt`);
  const agent = new https.Agent({ ca });

  // List candidate namespaces with the landing page's own ServiceAccount, then
  // keep only those the signed-in user is allowed to use. An optional label
  // selector lets large clusters narrow the candidate set server-side.
  type NsMeta = {
    metadata?: {
      name?: string;
      annotations?: Record<string, string>;
    };
  };
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const resp = (await coreApi.listNamespace(
    NAMESPACE_SELECTOR ? { labelSelector: NAMESPACE_SELECTOR } : undefined,
  )) as unknown as {
    body?: { items?: NsMeta[] };
    items?: NsMeta[];
  };

  const candidates = (resp.body?.items ?? resp.items ?? [])
    .map((n) => {
      const name = n.metadata?.name;
      if (!name) return null;
      const annotations = n.metadata?.annotations ?? {};
      return {
        name,
        displayName: annotations[DISPLAY_NAME_ANNOTATION] || name,
        description: annotations[DESCRIPTION_ANNOTATION] || undefined,
        dashboardUrl: annotations[DASHBOARD_URL_ANNOTATION] || undefined,
      } satisfies AccessibleNamespace;
    })
    .filter((c): c is AccessibleNamespace => c !== null);

  const checks = await mapWithConcurrency(
    candidates,
    SSAR_CONCURRENCY,
    async (ns) => ({
      ns,
      allowed: await canListAgents(
        cluster.server,
        agent,
        saToken,
        email,
        groups,
        ns.name,
      ),
    }),
  );

  const result = checks
    .filter((c) => c.allowed)
    .map((c) => c.ns)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (CACHE_TTL_MS > 0) {
    namespaceCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: result });
  }
  return result;
}
