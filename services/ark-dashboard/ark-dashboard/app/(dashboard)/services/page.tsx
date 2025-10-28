'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
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
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type ArkService, arkServicesService } from '@/lib/services';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

// Column definitions
const columnDefinitions: ColumnDef<ArkService>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    size: 200,
    cell: ({ row }) => {
      const service = row.original;
      return (
        <div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help font-medium">
                    {service.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    {service.ark_service_type && (
                      <div>Ark Service Type: {service.ark_service_type}</div>
                    )}
                    <div>Chart: {service.chart}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {service.ark_resources && service.ark_resources.length > 0 && (
              <div className="flex gap-1">
                {service.ark_resources.map(
                  (resource: string, index: number) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {resource}
                    </Badge>
                  ),
                )}
              </div>
            )}
          </div>
          {service.description && (
            <div className="text-muted-foreground mt-1 text-xs">
              {service.description}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'chart_version',
    header: 'Version',
    size: 140,
    cell: ({ row }) => {
      const service = row.original;
      const chartVersion = service.chart_version;
      const appVersion = service.app_version;

      return (
        <div className="text-sm">
          {appVersion && <div className="font-medium">{appVersion}</div>}
          {chartVersion && (
            <div className="text-muted-foreground text-xs">
              Chart: {chartVersion}
            </div>
          )}
          {!chartVersion && !appVersion && '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'revision',
    header: 'Revision',
    size: 100,
    cell: ({ row }) => {
      return <div>{row.getValue('revision')}</div>;
    },
  },
  {
    accessorKey: 'updated',
    header: 'Updated',
    size: 150,
    cell: ({ row }) => {
      const updated = row.original.updated;
      if (!updated)
        return <div className="text-muted-foreground text-sm">-</div>;

      try {
        const date = new Date(updated);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        let timeAgo;
        if (diffDays > 0) {
          timeAgo = `${diffDays}d ago`;
        } else if (diffHours > 0) {
          timeAgo = `${diffHours}h ago`;
        } else if (diffMinutes > 0) {
          timeAgo = `${diffMinutes}m ago`;
        } else {
          timeAgo = 'Just now';
        }

        return (
          <div className="text-sm">
            <div>{timeAgo}</div>
            <div className="text-muted-foreground text-xs">
              {date.toLocaleDateString()}
            </div>
          </div>
        );
      } catch {
        return <div className="text-muted-foreground text-sm">-</div>;
      }
    },
  },
  {
    accessorKey: 'httproutes',
    header: 'Routes',
    cell: ({ row }) => {
      const routes = row.original.httproutes;
      if (!routes || routes.length === 0) {
        return <div className="text-muted-foreground text-sm">No routes</div>;
      }

      return (
        <div className="space-y-1">
          {routes.map((route, index) => (
            <div key={index}>
              <a
                href={route.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                {route.url.replace('http://', '')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      );
    },
  },
];

// Data table component
function DataTable<TData, TValue>({
  columns,
  data,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map(row => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No ARK services found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ServicesContent() {
  const [services, setServices] = useState<ArkService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServices = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await arkServicesService.getAll();
        setServices(data.items);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load ARK services',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader breadcrumbs={breadcrumbs} currentPage="ARK Services" />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="flex h-32 items-center justify-center">
              <div className="text-muted-foreground">Loading services...</div>
            </div>
          </main>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader breadcrumbs={breadcrumbs} currentPage="ARK Services" />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 overflow-auto p-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
              <p className="font-medium">Error loading ARK services</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="ARK Services" />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4">
          <DataTable columns={columnDefinitions} data={services} />
        </main>
      </div>
    </>
  );
}

export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Loading...
        </div>
      }>
      <ServicesContent />
    </Suspense>
  );
}
