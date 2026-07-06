'use client';

import { ShieldAlert } from 'lucide-react';

type AccessDeniedProps = {
  namespace?: string;
  email?: string | null;
  missing?: string[];
};

export function AccessDenied({ namespace, email, missing }: AccessDeniedProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="bg-card text-card-foreground max-w-md rounded-lg border p-8 text-center shadow-sm">
        <ShieldAlert className="text-muted-foreground mx-auto mb-4 h-10 w-10" />
        <h1 className="mb-2 text-lg font-semibold">
          No access to this namespace
        </h1>
        <p className="text-muted-foreground mb-4 text-sm">
          {email ? <>Signed in as {email}. </> : null}
          You don&apos;t have permission to use Ark resources in
          {namespace ? (
            <> namespace &apos;{namespace}&apos;</>
          ) : (
            <> this namespace</>
          )}
          .
        </p>
        {missing && missing.length > 0 ? (
          <p className="text-muted-foreground mb-4 text-xs">
            Missing access to: {missing.join(', ')}.
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Ask a cluster administrator to create a RoleBinding granting you
          access.
        </p>
      </div>
    </div>
  );
}
