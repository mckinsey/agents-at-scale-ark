'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';
import { useState } from 'react';

import { ArrowDownwardAlt } from '@/components/icons/ArrowDownwardAlt';
import { ArrowUpwardAlt } from '@/components/icons/ArrowUpwardAlt';
import { Delete } from '@/components/icons/Delete';
import { Edit } from '@/components/icons/Edit';
import { SwapVert } from '@/components/icons/SwapVert';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const basePath = import.meta.env.VITE_BASE_PATH ?? '';

const invoices = [
  {
    invoice: 'INV001',
    paymentStatus: 'Paid',
    totalAmount: '$250.00',
    paymentMethod: 'Credit Card',
    avatars: ['avatar-1.jpg', 'avatar-2.jpg', 'avatar-3.jpg'],
  },
  {
    invoice: 'INV002',
    paymentStatus: 'Pending',
    totalAmount: '$150.00',
    paymentMethod: 'PayPal',
    avatars: ['avatar-4.jpg', 'avatar-5.jpg'],
  },
  {
    invoice: 'INV003',
    paymentStatus: 'Unpaid',
    totalAmount: '$350.00',
    paymentMethod: 'Bank Transfer',
    avatars: ['avatar-6.jpg', 'avatar-7.jpg', 'avatar-1.jpg', 'avatar-2.jpg'],
  },
  {
    invoice: 'INV004',
    paymentStatus: 'Paid',
    totalAmount: '$450.00',
    paymentMethod: 'Credit Card',
    avatars: ['avatar-3.jpg'],
  },
  {
    invoice: 'INV005',
    paymentStatus: 'Paid',
    totalAmount: '$550.00',
    paymentMethod: 'PayPal',
    avatars: ['avatar-5.jpg', 'avatar-6.jpg'],
  },
];

const users = [
  {
    id: 1,
    name: 'John Smith',
    email: 'john@example.com',
    role: 'Admin',
    status: 'success' as const,
    avatar: `${basePath}/users/avatar-1.jpg`,
  },
  {
    id: 2,
    name: 'Sarah Johnson',
    email: 'sarah@example.com',
    role: 'Editor',
    status: 'success' as const,
    avatar: `${basePath}/users/avatar-2.jpg`,
  },
  {
    id: 3,
    name: 'Mike Wilson',
    email: 'mike@example.com',
    role: 'Viewer',
    status: 'warning' as const,
    avatar: `${basePath}/users/avatar-3.jpg`,
  },
  {
    id: 4,
    name: 'Emily Davis',
    email: 'emily@example.com',
    role: 'Editor',
    status: 'neutral' as const,
    avatar: `${basePath}/users/avatar-7.jpg`,
  },
];

const getUserStatusLabel = (status: string) => {
  switch (status) {
    case 'success':
      return 'Active';
    case 'warning':
      return 'Away';
    default:
      return 'Offline';
  }
};

// ============================================================================
// Example Components (New Format)
// ============================================================================

/**
 * Table sizes comparison
 */
export function TableSizes() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <label className="text-fg-primary text-sm font-medium">
          Default Size
        </label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.slice(0, 3).map(invoice => (
              <TableRow key={invoice.invoice}>
                <TableCell className="font-medium">{invoice.invoice}</TableCell>
                <TableCell>
                  <AvatarGroup>
                    {invoice.avatars.map(src => (
                      <Avatar key={src} size="sm">
                        <AvatarImage src={`${basePath}/users/${src}`} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                </TableCell>
                <TableCell>{invoice.paymentStatus}</TableCell>
                <TableCell>{invoice.totalAmount}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm">
                    Label
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-2">
        <label className="text-fg-primary text-sm font-medium">
          Small Size
        </label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead size="small">Invoice</TableHead>
              <TableHead size="small">Users</TableHead>
              <TableHead size="small">Status</TableHead>
              <TableHead size="small">Amount</TableHead>
              <TableHead size="small" className="text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.slice(0, 3).map(invoice => (
              <TableRow key={invoice.invoice}>
                <TableCell size="small" className="font-medium">
                  {invoice.invoice}
                </TableCell>
                <TableCell size="small">
                  <AvatarGroup>
                    {invoice.avatars.map(src => (
                      <Avatar key={src} size="xs">
                        <AvatarImage src={`${basePath}/users/${src}`} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                    ))}
                  </AvatarGroup>
                </TableCell>
                <TableCell size="small">{invoice.paymentStatus}</TableCell>
                <TableCell size="small">{invoice.totalAmount}</TableCell>
                <TableCell size="small" className="text-right">
                  <Button variant="outline" size="sm">
                    Label
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Rich table combining multiple components
 */
export function TableRich() {
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const toggleRow = (id: number) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id],
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]" />
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow
            key={user.id}
            data-state={
              selectedRows.includes(user.id) ? 'selected' : undefined
            }>
            <TableCell>
              <Checkbox
                checked={selectedRows.includes(user.id)}
                onCheckedChange={() => toggleRow(user.id)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar size="sm">
                    {user.avatar && <AvatarImage src={user.avatar} />}
                    <AvatarFallback>
                      {user.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <StatusBadge
                    variant={user.status}
                    size="sm"
                    className="absolute -right-0.5 -bottom-0.5"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-fg-secondary text-sm">
                    {user.email}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge format="pill" variant="high-emphasis">
                {user.role}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge outline variant="high-emphasis">
                {getUserStatusLabel(user.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon-xs">
                  <IconShell size="sm">
                    <Edit />
                  </IconShell>
                </Button>
                <Button variant="ghost" size="icon-xs">
                  <IconShell size="sm">
                    <Delete />
                  </IconShell>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================================================
// Data Table — Types, Data & Columns
// ============================================================================

type Payment = {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  email: string;
  priority: 'low' | 'medium' | 'high';
};

const payments: Payment[] = [
  {
    id: 'm5gr84i9',
    amount: 316,
    status: 'success',
    email: 'ken99@example.com',
    priority: 'high',
  },
  {
    id: '3u1reuv4',
    amount: 242,
    status: 'success',
    email: 'Abe45@example.com',
    priority: 'medium',
  },
  {
    id: 'derv1ws0',
    amount: 837,
    status: 'processing',
    email: 'Monserrat44@example.com',
    priority: 'low',
  },
  {
    id: '5kma53ae',
    amount: 874,
    status: 'success',
    email: 'Silas22@example.com',
    priority: 'high',
  },
  {
    id: 'bhqecj4p',
    amount: 721,
    status: 'failed',
    email: 'carmella@example.com',
    priority: 'medium',
  },
];

const getPaymentColumns = (
  updateData: (newData: Payment[]) => void,
  currentData: Payment[],
): ColumnDef<Payment>[] => [
  {
    id: 'select',
    header: ({ table: t }) => (
      <Checkbox
        checked={
          t.getIsAllPageRowsSelected() ||
          (t.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={value => t.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={value => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => {
      const sortDirection = column.getIsSorted();
      const isSorted = sortDirection !== false;

      let SortIcon = SwapVert;

      if (sortDirection === 'asc') {
        SortIcon = ArrowUpwardAlt;
      } else if (sortDirection === 'desc') {
        SortIcon = ArrowDownwardAlt;
      }

      let nextSortDirection = 'ascending';

      if (sortDirection === 'asc') {
        nextSortDirection = 'descending';
      }

      return (
        <button
          type="button"
          className="font-inherit flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-inherit"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          aria-label={`Sort by Email ${nextSortDirection}`}>
          Email
          <IconShell size="sm" variant={isSorted ? 'primary' : 'secondary'}>
            <SortIcon />
          </IconShell>
        </button>
      );
    },
    cell: ({ row }) => <div className="lowercase">{row.getValue('email')}</div>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as Payment['status'];

      return (
        <Badge format="pill" variant="high-emphasis">
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    cell: ({ row }) => {
      const payment = row.original;
      const currentPriority =
        (row.getValue('priority') as Payment['priority']) || 'medium';

      const updatePriority = (newPriority: Payment['priority']) => {
        const updatedData = currentData.map((item: Payment) =>
          item.id === payment.id ? { ...item, priority: newPriority } : item,
        );
        updateData(updatedData);
      };

      return (
        <Select
          value={currentPriority}
          onValueChange={value => updatePriority(value as Payment['priority'])}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      );
    },
  },
  {
    accessorKey: 'amount',
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = Number.parseFloat(row.getValue('amount'));

      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);

      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
];

/**
 * Full-featured data table with sorting, filtering, and selection
 */
export function DataTableDemo() {
  const [data, setData] = React.useState<Payment[]>(payments);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  const columns = React.useMemo(() => getPaymentColumns(setData, data), [data]);

  const dataTable = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          {dataTable.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const isSorted = header.column.getIsSorted() !== false;
                return (
                  <TableHead key={header.id} selected={isSorted}>
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
          {dataTable.getRowModel().rows?.length ? (
            dataTable.getRowModel().rows.map(row => (
              <TableRow key={row.id} selected={row.getIsSelected()}>
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
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================================
// Example Metadata
// ============================================================================

// NOSONAR - Intentional duplication of example metadata pattern across demo files
export const examples = [
  {
    name: 'TableRich',
    title: 'Default',
    description:
      'Combines Avatar, Badge, Checkbox, and Button components in a user management table.',
  },
  {
    name: 'TableSizes',
    title: 'Size Comparison',
    description: 'Default and small table sizes side by side.',
  },
  {
    name: 'DataTableDemo',
    title: 'Data Table',
    description:
      'Data table with sorting, filtering, pagination, and row selection.',
  },
];

export const dataTableExamples = [
  {
    name: 'DataTableDemo',
    title: 'Default',
    description:
      'Data table with sorting, filtering, pagination, and row selection.',
  },
];

// ============================================================================
// Legacy Format (for backwards compatibility)
// ============================================================================

export const table = {
  name: 'table',
  components: {
    Default: <TableRich />,
    'Size Comparison': <TableSizes />,
    'Data Table': <DataTableDemo />,
  },
};

export const dataTable = {
  name: 'data-table',
  components: {
    Default: <DataTableDemo />,
  },
};
