'use client';

import type { ComponentProps } from 'react';

import { Autorenew, Info } from '@/components/icons';
import { ResourceErrorState } from '@/components/sections/resource-list-states';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
} from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import type {
  HelmRelease,
  HelmReleaseError,
} from '@/lib/services/ark-services';
import { useGetAllArkServices } from '@/lib/services/ark-services-hooks';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

const COL = {
  version: 'w-[160px]',
  revision: 'w-[100px]',
  status: 'w-[140px]',
};

const TABLE_CLASS =
  'table-fixed border-separate border-spacing-x-2 border-spacing-y-0';

const SKELETON_ROWS = ['first', 'second', 'third'];

type ReleaseStatusVariant = NonNullable<
  ComponentProps<typeof StatusBadge>['variant']
>;

interface ReleaseStatusConfig {
  label: string;
  variant: ReleaseStatusVariant;
}

const RELEASE_STATUS_CONFIG: Record<string, ReleaseStatusConfig> = {
  deployed: { label: 'Healthy', variant: 'success' },
  pending_install: { label: 'Installing', variant: 'warning' },
  pending_upgrade: { label: 'Upgrading', variant: 'warning' },
  pending_rollback: { label: 'Rolling back', variant: 'warning' },
  failed: { label: 'Failed', variant: 'error' },
};

const UNKNOWN_RELEASE_STATUS: ReleaseStatusConfig = {
  label: 'Unknown',
  variant: 'neutral',
};

function NamespaceScopeAlert({ namespace }: Readonly<{ namespace: string }>) {
  return (
    <Alert layout="long" role="status" className="gap-2 px-3 py-2">
      <AlertIcon className="size-5 self-center">
        <Info className="size-5" />
      </AlertIcon>
      <AlertContent className="pt-0 first:pl-0">
        <AlertDescription className="paragraph-regular-primary">
          <strong className="paragraph-regular-emphasised-600 text-fg-primary">
            Showing your namespace only.
          </strong>{' '}
          These are the Helm releases installed in{' '}
          <strong className="paragraph-regular-emphasised-600">
            {namespace}
          </strong>
          {
            ". Services in other namespaces, such as the Ark controller, aren't listed."
          }
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function TableSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex flex-col gap-4 pt-4">
      <output className="sr-only">{label}</output>
      <div aria-hidden className="flex flex-col gap-4">
        {SKELETON_ROWS.map(row => (
          <div key={row} className="flex items-center gap-4">
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-[120px]" />
            <Skeleton className="h-5 w-[140px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TruncatedText({ value }: Readonly<{ value: string }>) {
  return (
    <TruncatedTooltip label={value}>
      <span className="text-fg-primary block w-full truncate">{value}</span>
    </TruncatedTooltip>
  );
}

function ServiceStatus({ status }: Readonly<{ status: string }>) {
  const { label, variant } =
    RELEASE_STATUS_CONFIG[status.toLowerCase()] ?? UNKNOWN_RELEASE_STATUS;

  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge variant={variant} aria-hidden />
      <span className="label-regular-primary text-fg-primary">{label}</span>
    </span>
  );
}

function ServicesTable({ services }: Readonly<{ services: HelmRelease[] }>) {
  return (
    <Table aria-label="Tenant namespace services" className={TABLE_CLASS}>
      <TableHeader>
        <TableRow>
          <TableHead size="small">Service</TableHead>
          <TableHead size="small" className={COL.version}>
            Version
          </TableHead>
          <TableHead size="small" className={cn(COL.revision, 'text-right')}>
            Revision
          </TableHead>
          <TableHead size="small" className={COL.status}>
            Status
          </TableHead>
          <TableHead size="small">Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map(service => (
          <TableRow key={service.name}>
            <TableCell size="small">
              <TruncatedText value={service.name} />
            </TableCell>
            <TableCell size="small" className={COL.version}>
              {service.app_version ? (
                <TruncatedText value={service.app_version} />
              ) : (
                <span className="text-fg-tertiary">—</span>
              )}
            </TableCell>
            <TableCell size="small" className={cn(COL.revision, 'text-right')}>
              {service.revision}
            </TableCell>
            <TableCell size="small" className={COL.status}>
              <ServiceStatus status={service.status} />
            </TableCell>
            <TableCell size="small">
              <TruncatedText value={`Status: ${service.status}`} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReleaseErrorsAlert({
  errors,
}: Readonly<{ errors: HelmReleaseError[] }>) {
  const title =
    errors.length === 1
      ? "1 release couldn't be read"
      : `${errors.length} releases couldn't be read`;

  return (
    <ResourceErrorState
      className="mt-4"
      title={title}
      description={errors.map(error => (
        <span key={error.name} className="block break-words">
          <strong className="paragraph-regular-emphasised-600 text-fg-primary">
            {error.name}
          </strong>
          {`: ${error.message}`}
        </span>
      ))}
    />
  );
}

function TenantServicesSection() {
  const { namespace } = useNamespace();
  const { data, error, isPending, isError, refetch } = useGetAllArkServices();

  let content;
  if (isError) {
    content = (
      <ResourceErrorState
        className="mt-4"
        title="Failed to load services"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  } else if (isPending) {
    content = <TableSkeleton label="Loading services…" />;
  } else {
    content = (
      <>
        {data.errors.length > 0 && <ReleaseErrorsAlert errors={data.errors} />}
        {data.items.length > 0 && <ServicesTable services={data.items} />}
        {data.items.length === 0 && data.errors.length === 0 && (
          <p className="paragraph-regular-primary text-fg-secondary pt-4">
            No Helm releases found in this namespace.
          </p>
        )}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex flex-col gap-0.5">
        <p className="paragraph-small-primary text-fg-secondary">
          Tenant namespace
        </p>
        <h2 className="paragraph-large-primary text-fg-primary">{namespace}</h2>
      </div>
      {content}
    </section>
  );
}

export function DeploymentDetailsActions() {
  const { dataUpdatedAt, isFetching, refetch } = useGetAllArkServices();

  return (
    <div className="flex items-center gap-4">
      {dataUpdatedAt > 0 && (
        <span className="label-regular-primary text-fg-primary">
          Last checked:{' '}
          {new Date(dataUpdatedAt).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      )}
      <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
        <IconShell size="sm">
          <Autorenew className={cn(isFetching && 'animate-spin')} />
        </IconShell>
        Refresh
      </Button>
    </div>
  );
}

export function DeploymentDetailsSettings() {
  const { namespace } = useNamespace();

  return (
    <div className="flex flex-col gap-5">
      <NamespaceScopeAlert namespace={namespace} />
      <TenantServicesSection />
    </div>
  );
}
