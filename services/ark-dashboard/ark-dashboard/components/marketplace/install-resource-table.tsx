'use client';

import { ArrowForward, Warning } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getInstallResourceHref,
  getInstallResourceLinkLabel,
} from '@/lib/constants/install-resource-routes';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type {
  InstallResource,
  InstallResourceState,
} from '@/lib/services/marketplace-install-types';

const RESOURCE_STATE_LABEL: Readonly<Record<InstallResourceState, string>> = {
  free: 'New',
  adopted: 'Updates existing',
  'conflict-release': 'Name in use',
  'conflict-unmanaged': 'Already exists',
  unverifiable: 'Cannot verify',
};

function ResourceStatus({ resource }: Readonly<{ resource: InstallResource }>) {
  const label = RESOURCE_STATE_LABEL[resource.state] ?? resource.state;

  if (resource.state === 'free') {
    return <span className="text-fg-tertiary">{label}</span>;
  }

  if (resource.state === 'adopted') {
    return <span className="text-fg-secondary">{label}</span>;
  }

  const tone =
    resource.state === 'unverifiable'
      ? 'text-status-warning'
      : 'text-status-error';

  const detail =
    resource.state === 'conflict-release' && resource.ownedByRelease
      ? `Owned by release ${resource.ownedByRelease}`
      : resource.state === 'conflict-unmanaged'
        ? 'Exists outside Helm'
        : 'Permission to read it was denied';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={`${tone} inline-flex cursor-default items-center justify-end gap-1.5`}>
          <IconShell size="sm">
            <Warning />
          </IconShell>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px] text-pretty">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}

export function InstallResourceTable({
  resources,
  showLinks,
}: Readonly<{ resources: InstallResource[]; showLinks: boolean }>) {
  const { push } = useNamespacedNavigation();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead size="small">Kind</TableHead>
          <TableHead size="small">Name</TableHead>
          <TableHead size="small" className="text-right">
            {showLinks ? 'Result' : 'Status'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map(resource => {
          const href = showLinks
            ? getInstallResourceHref(resource.kind, resource.name)
            : undefined;

          return (
            <TableRow key={`${resource.kind}/${resource.name}`}>
              <TableCell size="small" className="text-fg-secondary h-11">
                {resource.kind}
              </TableCell>
              <TableCell size="small" className="h-11">
                {resource.name}
              </TableCell>
              <TableCell size="small" className="h-11 text-right">
                {href ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => push(href)}>
                    {getInstallResourceLinkLabel(resource.kind)}
                    <IconShell size="sm">
                      <ArrowForward />
                    </IconShell>
                  </Button>
                ) : null}
                {!href && !showLinks ? (
                  <ResourceStatus resource={resource} />
                ) : null}
                {!href && showLinks ? (
                  <span className="text-fg-tertiary">Created</span>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
