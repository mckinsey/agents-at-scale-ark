import { Info, Server } from 'lucide-react';

import { StatusBadge } from '@/components/ui/status-badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { A2AServerConfiguration } from '@/lib/services/a2a-servers';
import type { A2AServer } from '@/lib/services/a2a-servers';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

import type { BaseCardAction } from './base-card';
import { BaseCard } from './base-card';

interface A2AServerCardProps {
  a2aServer: A2AServer;
  onInfo?: (a2aServer: A2AServer) => void;
  namespace: string;
  onUpdate?: (a2aServerConfig: A2AServerConfiguration, edit: boolean) => void;
}

export function A2AServerCard({ a2aServer, onInfo }: A2AServerCardProps) {
  const actions: BaseCardAction[] = [];

  // Get custom icon or default Server icon
  const annotations = a2aServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  if (onInfo) {
    actions.push({
      icon: Info,
      label: 'View a2a server details',
      onClick: () => onInfo(a2aServer),
    });
  }

  // Get the address from either status.lastResolvedAddress or spec.address.value
  const address = a2aServer.address || 'Address not available';

  return (
    <>
      <BaseCard
        title={a2aServer.name || 'Unnamed Server'}
        icon={<IconComponent className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        actions={actions}
        footer={
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            <div className="w-fit">
              <StatusBadge
                ready={a2aServer.ready}
                discovering={a2aServer.discovering}
              />
            </div>
            <div>
              <span className="font-medium">Address:</span> {address}
            </div>
            {a2aServer.status_message && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {a2aServer.status_message}
              </div>
            )}
          </div>
        }
      />
    </>
  );
}
