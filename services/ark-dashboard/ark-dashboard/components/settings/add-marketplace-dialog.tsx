'use client';

import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MarketplaceAuthScheme } from '@/lib/services/marketplace';
import {
  ADO_FIELD_DEFAULTS,
  type AdoFields,
  buildAdoUrl,
} from '@/lib/services/marketplace-ado';
import {
  useCreateMarketplaceSource,
  useMarketplaceCanEdit,
} from '@/lib/services/marketplace-hooks';
import { cn } from '@/lib/utils';

const PUBLIC_MARKETPLACE_URL =
  'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json';

type SchemeChoice = 'none' | MarketplaceAuthScheme;

type UrlMode = 'custom' | 'ado';

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
  { value: 'bearer', label: 'Bearer/token' },
  { value: 'basic', label: 'HTTP Basic (Azure DevOps)' },
];

const URL_MODE_OPTIONS: { value: UrlMode; label: string }[] = [
  { value: 'custom', label: 'Custom URL' },
  { value: 'ado', label: 'Azure DevOps' },
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

type AddMarketplaceDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function AddMarketplaceDialog({
  open,
  onOpenChange,
}: AddMarketplaceDialogProps) {
  const createSource = useCreateMarketplaceSource();
  const contentRef = useRef<HTMLDivElement>(null);

  const fieldId = useId();
  const urlFieldId = `${fieldId}-url`;
  const displayFieldId = `${fieldId}-display`;
  const schemeFieldId = `${fieldId}-scheme`;
  const credentialFieldId = `${fieldId}-credential`;

  const [newSource, setNewSource] = useState<NewSourceForm>(EMPTY_FORM);
  const [urlMode, setUrlMode] = useState<UrlMode>('custom');
  const [adoFields, setAdoFields] = useState<AdoFields>(ADO_FIELD_DEFAULTS);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  const adoUrl = urlMode === 'ado' ? buildAdoUrl(adoFields) : null;
  const effectiveUrl = urlMode === 'ado' ? (adoUrl ?? '') : newSource.url;

  const resetForm = () => {
    setNewSource(EMPTY_FORM);
    setUrlMode('custom');
    setAdoFields(ADO_FIELD_DEFAULTS);
    setUrlError(null);
    setCredentialError(null);
  };

  const handleUrlModeChange = (mode: UrlMode) => {
    setUrlMode(mode);
    setUrlError(null);
    if (mode === 'ado' && newSource.scheme === 'none') {
      setNewSource({ ...newSource, scheme: 'basic' });
    }
  };

  const handleAddSource = () => {
    const staticError = validateMarketplaceUrl(effectiveUrl);
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
        name: deriveSourceName(newSource.displayName, effectiveUrl),
        url: effectiveUrl,
        displayName: newSource.displayName || undefined,
        auth:
          scheme === 'none'
            ? undefined
            : { scheme, credential: newSource.credential },
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && createSource.isPending) {
      return;
    }
    if (!next) {
      resetForm();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent ref={contentRef} className="sm:max-w-[586px]">
        <DialogHeader>
          <DialogTitle>Add new marketplace</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <FieldSet className="gap-2">
            <FieldLabel htmlFor={urlFieldId}>Marketplace JSON URL</FieldLabel>
            <div className="flex gap-2">
              {URL_MODE_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  type="button"
                  variant={urlMode === option.value ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => handleUrlModeChange(option.value)}>
                  {option.label}
                </Button>
              ))}
            </div>
            {urlMode === 'custom' && (
              <Input
                id={urlFieldId}
                variant="inline"
                value={newSource.url}
                onChange={e => {
                  setNewSource({ ...newSource, url: e.target.value });
                  setUrlError(null);
                }}
                placeholder="e.g. https://raw.githubusercontent.com/org/repo/main/marketplace.json"
                aria-invalid={!!urlError}
              />
            )}
            {urlMode === 'ado' && (
              <div className="border-stroke-divider flex flex-col gap-4 border p-3">
                <div className="grid grid-cols-2 gap-4">
                  <FieldSet className="gap-2">
                    <FieldLabel htmlFor="ado-org">Organization</FieldLabel>
                    <Input
                      id="ado-org"
                      variant="inline"
                      value={adoFields.org}
                      onChange={e => {
                        setAdoFields({ ...adoFields, org: e.target.value });
                        setUrlError(null);
                      }}
                      placeholder="my-org"
                    />
                  </FieldSet>
                  <FieldSet className="gap-2">
                    <FieldLabel htmlFor="ado-project">Project</FieldLabel>
                    <Input
                      id="ado-project"
                      variant="inline"
                      value={adoFields.project}
                      onChange={e => {
                        setAdoFields({ ...adoFields, project: e.target.value });
                        setUrlError(null);
                      }}
                      placeholder="my-project"
                    />
                  </FieldSet>
                  <FieldSet className="gap-2">
                    <FieldLabel htmlFor="ado-repo">Repository</FieldLabel>
                    <Input
                      id="ado-repo"
                      variant="inline"
                      value={adoFields.repo}
                      onChange={e => {
                        setAdoFields({ ...adoFields, repo: e.target.value });
                        setUrlError(null);
                      }}
                      placeholder="my-repo"
                    />
                  </FieldSet>
                  <FieldSet className="gap-2">
                    <FieldLabel htmlFor="ado-branch">Branch</FieldLabel>
                    <Input
                      id="ado-branch"
                      variant="inline"
                      value={adoFields.branch}
                      onChange={e => {
                        setAdoFields({ ...adoFields, branch: e.target.value });
                        setUrlError(null);
                      }}
                    />
                  </FieldSet>
                  <FieldSet className="col-span-2 gap-2">
                    <FieldLabel htmlFor="ado-path">Path</FieldLabel>
                    <Input
                      id="ado-path"
                      variant="inline"
                      value={adoFields.path}
                      onChange={e => {
                        setAdoFields({ ...adoFields, path: e.target.value });
                        setUrlError(null);
                      }}
                    />
                  </FieldSet>
                </div>
                <FieldSet className="gap-2">
                  <FieldLabel htmlFor="ado-generated-url">
                    Generated URL
                  </FieldLabel>
                  <Input
                    id="ado-generated-url"
                    variant="inline"
                    value={
                      adoUrl ?? 'Fill in organization, project and repository'
                    }
                    readOnly
                  />
                </FieldSet>
              </div>
            )}
            <FieldError>{urlError}</FieldError>
            {urlError && (
              <FieldDescription>
                <a
                  href={PUBLIC_MARKETPLACE_URL}
                  target="_blank"
                  rel="noopener noreferrer">
                  See the public marketplace.json for reference.
                </a>
              </FieldDescription>
            )}
          </FieldSet>

          <FieldSet className="gap-2">
            <FieldLabel htmlFor={displayFieldId}>Display name</FieldLabel>
            <Input
              id={displayFieldId}
              variant="inline"
              value={newSource.displayName}
              onChange={e =>
                setNewSource({ ...newSource, displayName: e.target.value })
              }
              placeholder="e.g. Ark Marketplace"
            />
          </FieldSet>

          <FieldSet className="gap-2">
            <FieldLabel htmlFor={schemeFieldId}>Authentication</FieldLabel>
            <Select
              items={SCHEME_OPTIONS}
              value={newSource.scheme}
              onValueChange={value =>
                setNewSource({
                  ...newSource,
                  scheme: value as SchemeChoice,
                  credential: '',
                })
              }>
              <SelectTrigger
                id={schemeFieldId}
                aria-label="Authentication"
                className={cn(GHOST_TRIGGER, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                container={contentRef}
                className="bg-fill-onsurface-ui-2">
                {SCHEME_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <SelectItemText>{option.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldSet>

          {newSource.scheme !== 'none' && (
            <FieldSet className="gap-2">
              <FieldLabel htmlFor={credentialFieldId}>Token</FieldLabel>
              <Input
                id={credentialFieldId}
                type="password"
                variant="inline"
                autoComplete="off"
                value={newSource.credential}
                onChange={e => {
                  setNewSource({ ...newSource, credential: e.target.value });
                  setCredentialError(null);
                }}
                placeholder="Sent once on save; never displayed again"
                aria-invalid={!!credentialError}
              />
              <FieldError>{credentialError}</FieldError>
            </FieldSet>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleOpenChange(false)}
            disabled={createSource.isPending}>
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={handleAddSource}
            disabled={createSource.isPending}>
            {createSource.isPending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddMarketplaceButton() {
  const { data: permissions } = useMarketplaceCanEdit();
  const [open, setOpen] = useState(false);

  if (!(permissions?.canEdit ?? false)) {
    return null;
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add new marketplace</Button>
      <AddMarketplaceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
