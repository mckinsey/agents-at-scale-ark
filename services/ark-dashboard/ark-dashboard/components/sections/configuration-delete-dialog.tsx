'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useGetConfigurationReferences } from '@/lib/services/configurations-hooks';

interface ConfigurationDeleteDialogProps {
  readonly name: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

export function ConfigurationDeleteDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: Readonly<ConfigurationDeleteDialogProps>) {
  const { data: references = [], isLoading } = useGetConfigurationReferences(
    open ? name : undefined,
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete configuration</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-3">
              <p>
                Do you want to delete &quot;{name}&quot;? This action cannot be
                undone.
              </p>
              {isLoading && (
                <span className="text-fg-secondary flex items-center gap-2 text-sm">
                  <Spinner className="size-4" />
                  Checking which resources use it...
                </span>
              )}
              {!isLoading && references.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-status-warning">
                    {references.length === 1
                      ? '1 resource still reads this configuration'
                      : `${references.length} resources still read this configuration`}{' '}
                    and will fail to resolve it:
                  </p>
                  <ul className="text-fg-secondary flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
                    {references.map(reference => (
                      <li
                        key={`${reference.kind}/${reference.name}/${reference.field}`}>
                        {reference.kind} <strong>{reference.name}</strong> —{' '}
                        {reference.field}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-status-error text-fg-primary-inverse">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
