'use client';

import { ServerCrash } from 'lucide-react';

type ClusterUnavailableProps = {
  namespace?: string;
  reason?: string | null;
};

export function ClusterUnavailable({
  namespace,
  reason,
}: ClusterUnavailableProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="bg-card text-card-foreground max-w-md rounded-lg border p-8 text-center shadow-sm">
        <ServerCrash className="text-muted-foreground mx-auto mb-4 h-10 w-10" />
        <h1 className="mb-2 text-lg font-semibold">Cluster unavailable</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Couldn&apos;t evaluate your access for
          {namespace ? (
            <> namespace &apos;{namespace}&apos;</>
          ) : (
            <> this namespace</>
          )}
          . The cluster authorization service may be unreachable.
        </p>
        {reason ? (
          <p className="text-muted-foreground bg-muted/50 rounded p-2 text-left font-mono text-xs">
            {reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
