'use client';

import { Spinner } from '@/components/ui/spinner';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isNamespaceResolved } = useNamespace();

  if (!isNamespaceResolved) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-2">
        <Spinner className="mr-2" />
        <div className="muted text-lg font-semibold">
          Loading Ark Dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}
