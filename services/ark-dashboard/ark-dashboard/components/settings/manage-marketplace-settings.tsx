'use client';

import { Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MarketplaceAuthScheme } from '@/lib/services/marketplace';
import {
  useCreateMarketplaceSource,
  useDeleteMarketplaceSource,
  useMarketplaceCanEdit,
  useMarketplaceSources,
} from '@/lib/services/marketplace-hooks';

const PUBLIC_MARKETPLACE_URL =
  'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json';

type SchemeChoice = 'none' | MarketplaceAuthScheme;

type NewSourceForm = {
  url: string;
  displayName: string;
  scheme: SchemeChoice;
  credential: string;
};

const EMPTY_FORM: NewSourceForm = {
  url: '',
  displayName: '',
  scheme: 'none',
  credential: '',
};

const SCHEME_OPTIONS: { value: SchemeChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer / token' },
  { value: 'basic', label: 'HTTP Basic (Azure DevOps)' },
];

function validateMarketplaceUrl(url: string): string | null {
  if (!url) return 'Marketplace URL is required';
  if (!url.startsWith('https://')) return 'Only HTTPS URLs are allowed';
  return null;
}

// Derive a ConfigMap-key-safe source name from the display name or URL.
function deriveSourceName(displayName: string, url: string): string {
  // Regex-free on purpose: a char-by-char scan is provably linear, so it can't
  // trip the ReDoS analyzer the way a quantified character class does.
  const raw = displayName || (url.startsWith('https://') ? url.slice(8) : url);
  const base = raw.slice(0, 200).toLowerCase();
  let slug = '';
  for (const ch of base) {
    const allowed =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '.' ||
      ch === '_' ||
      ch === '-';
    if (allowed) slug += ch;
    else if (!slug.endsWith('-')) slug += '-';
  }
  let start = 0;
  let end = slug.length;
  while (start < end && (slug[start] === '-' || slug[start] === '.')) start++;
  while (end > start && (slug[end - 1] === '-' || slug[end - 1] === '.')) end--;
  return slug.slice(start, end) || 'source';
}

export function ManageMarketplaceSettings() {
  const { data: sources, isPending } = useMarketplaceSources();
  const { data: permissions } = useMarketplaceCanEdit();
  const createSource = useCreateMarketplaceSource();
  const deleteSource = useDeleteMarketplaceSource();

  const canEdit = permissions?.canEdit ?? false;

  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState<NewSourceForm>(EMPTY_FORM);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  const handleAddSource = () => {
    const staticError = validateMarketplaceUrl(newSource.url);
    if (staticError) {
      setUrlError(staticError);
      return;
    }
    setUrlError(null);

    const scheme = newSource.scheme;
    if (scheme !== 'none' && !newSource.credential) {
      setCredentialError('A credential is required for authenticated sources');
      return;
    }
    setCredentialError(null);

    createSource.mutate(
      {
        name: deriveSourceName(newSource.displayName, newSource.url),
        url: newSource.url,
        displayName: newSource.displayName || undefined,
        auth:
          scheme === 'none'
            ? undefined
            : { scheme, credential: newSource.credential },
      },
      {
        onSuccess: () => {
          setNewSource(EMPTY_FORM);
          setIsAdding(false);
        },
      },
    );
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewSource(EMPTY_FORM);
    setUrlError(null);
    setCredentialError(null);
  };

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading marketplace sources…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sources && sources.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Marketplace Sources</h2>
          <div className="space-y-3">
            {sources.map(source => (
              <div key={source.name} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">
                        {source.displayName || source.name}
                      </Label>
                      {source.hasCredential && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          {source.auth?.scheme === 'basic' ? 'Basic' : 'Bearer'}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-sm text-muted-foreground">
                        Marketplace JSON URL
                      </div>
                      <Input
                        value={source.url}
                        readOnly
                        className="bg-muted/50 font-mono text-sm"
                      />
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSource.mutate(source.name)}
                      disabled={deleteSource.isPending}
                      className="ml-4 h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!sources || sources.length === 0) && (
        <p className="text-sm text-muted-foreground">No marketplace sources configured.</p>
      )}

      {canEdit && isAdding && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-medium">Add new marketplace</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-url" className="text-sm">
                Marketplace JSON URL
              </Label>
              <Input
                id="new-url"
                value={newSource.url}
                onChange={e => {
                  setNewSource({ ...newSource, url: e.target.value });
                  setUrlError(null);
                }}
                placeholder="https://raw.githubusercontent.com/org/repo/main/marketplace.json"
                className={`mt-1.5 font-mono text-sm${urlError ? ' border-destructive' : ''}`}
              />
              {urlError && (
                <p className="mt-1 text-xs text-destructive">
                  {urlError}{' '}
                  <a
                    href={PUBLIC_MARKETPLACE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline">
                    See the public marketplace.json for reference.
                  </a>
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="new-display" className="text-sm">
                Display name (optional)
              </Label>
              <Input
                id="new-display"
                value={newSource.displayName}
                onChange={e => setNewSource({ ...newSource, displayName: e.target.value })}
                placeholder="e.g., Ark Marketplace"
                className="mt-1.5 text-sm"
              />
            </div>
            <div>
              <Label className="text-sm">Authentication</Label>
              <div className="mt-1.5 flex gap-2">
                {SCHEME_OPTIONS.map(option => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={newSource.scheme === option.value ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setNewSource({ ...newSource, scheme: option.value, credential: '' })
                    }>
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            {newSource.scheme !== 'none' && (
              <div>
                <Label htmlFor="new-credential" className="text-sm">
                  {newSource.scheme === 'basic' ? 'Personal access token' : 'Token'}
                </Label>
                <Input
                  id="new-credential"
                  type="password"
                  autoComplete="off"
                  value={newSource.credential}
                  onChange={e => {
                    setNewSource({ ...newSource, credential: e.target.value });
                    setCredentialError(null);
                  }}
                  placeholder="Sent once on save; never displayed again"
                  className={`mt-1.5 font-mono text-sm${
                    credentialError ? ' border-destructive' : ''
                  }`}
                />
                {credentialError && (
                  <p className="mt-1 text-xs text-destructive">{credentialError}</p>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelAdd}
              disabled={createSource.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddSource} disabled={createSource.isPending}>
              {createSource.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Adding…
                </>
              ) : (
                'Add'
              )}
            </Button>
          </div>
        </div>
      )}

      {canEdit && !isAdding && (
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
          onClick={() => setIsAdding(true)}>
          <Plus className="h-4 w-4" />
          Add new marketplace
        </Button>
      )}
    </div>
  );
}
