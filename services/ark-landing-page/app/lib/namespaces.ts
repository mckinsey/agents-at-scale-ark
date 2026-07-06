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

// Identity to impersonate, sourced from the (server-side) session — email and
// groups only, never the raw access token.
export interface UserIdentity {
  email?: string;
  groups?: string[];
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
      { method: 'POST', agent, headers },
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

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const cluster = kc.getCurrentCluster();
  if (!cluster?.server) return [];

  const saToken = fs.readFileSync(`${SA_DIR}/token`, 'utf8').trim();
  const ca = fs.readFileSync(`${SA_DIR}/ca.crt`);
  const agent = new https.Agent({ ca });

  // List all namespaces with the landing page's own ServiceAccount, then keep
  // only those the signed-in user is allowed to use.
  type NsMeta = {
    metadata?: {
      name?: string;
      annotations?: Record<string, string>;
    };
  };
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const resp = (await coreApi.listNamespace()) as unknown as {
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

  const checks = await Promise.all(
    candidates.map(async (ns) => ({
      ns,
      allowed: await canListAgents(
        cluster.server,
        agent,
        saToken,
        email,
        groups,
        ns.name,
      ),
    })),
  );

  return checks
    .filter((c) => c.allowed)
    .map((c) => c.ns)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
