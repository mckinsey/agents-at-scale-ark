export interface AdoFields {
  org: string;
  project: string;
  repo: string;
  branch: string;
  path: string;
}

export const ADO_FIELD_DEFAULTS: AdoFields = {
  org: '',
  project: '',
  repo: '',
  branch: 'main',
  path: '/marketplace.json',
};

function encodePath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

// Builds the Azure DevOps "Items" REST URL that returns raw file content.
// Returns null while org/project/repo are incomplete.
export function buildAdoUrl(fields: AdoFields): string | null {
  const org = fields.org.trim();
  const project = fields.project.trim();
  const repo = fields.repo.trim();
  const branch = fields.branch.trim();
  const path = fields.path.trim();
  if (!org || !project || !repo || !branch || !path) return null;

  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(
    project,
  )}/_apis/git/repositories/${encodeURIComponent(repo)}/items`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const query = [
    `path=${encodePath(normalizedPath)}`,
    'api-version=7.1',
    '$format=text',
    `versionDescriptor.version=${encodeURIComponent(branch)}`,
    'versionDescriptor.versionType=branch',
  ].join('&');
  return `${base}?${query}`;
}
