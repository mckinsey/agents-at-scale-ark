'use client';

import { useAtom } from 'jotai';

import {
  storedIsBrokerEnabledAtom,
  storedIsChatStreamingEnabledAtom,
  storedIsExperimentalExecutionEngineEnabledAtom,
  storedQueryTimeoutSettingAtom,
} from '@/atoms/experimental-features';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function ExperimentalFeaturesSettings() {
  const [isExecutionEngineEnabled, setIsExecutionEngineEnabled] = useAtom(
    storedIsExperimentalExecutionEngineEnabledAtom,
  );
  const [isBrokerEnabled, setIsBrokerEnabled] = useAtom(
    storedIsBrokerEnabledAtom,
  );
  const [isChatStreamingEnabled, setIsChatStreamingEnabled] = useAtom(
    storedIsChatStreamingEnabledAtom,
  );
  const [queryTimeout, setQueryTimeout] = useAtom(
    storedQueryTimeoutSettingAtom,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold">Agents</h2>
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label>Experimental Execution Engine Field</Label>
            <div className="text-muted-foreground text-sm">
              Enables the experimental{' '}
              <span className="font-bold">Execution Engine</span> field on
              Agents
            </div>
          </div>
          <Switch
            checked={isExecutionEngineEnabled}
            onCheckedChange={setIsExecutionEngineEnabled}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Observability</h2>
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label>Broker</Label>
            <div className="text-muted-foreground text-sm">
              Enables the experimental <span className="font-bold">Broker</span>{' '}
              diagnostic page for viewing real-time OTEL traces, messages, and
              LLM chunks
            </div>
          </div>
          <Switch
            checked={isBrokerEnabled}
            onCheckedChange={setIsBrokerEnabled}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Chat</h2>
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label>Chat Streaming</Label>
            <div className="text-muted-foreground text-sm">
              Enables streaming responses in the chat
            </div>
          </div>
          <Switch
            checked={isChatStreamingEnabled}
            onCheckedChange={setIsChatStreamingEnabled}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Queries</h2>
        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="flex-1 space-y-0.5">
            <Label>Query Timeout</Label>
            <div className="text-muted-foreground text-sm">
              Default timeout for query execution
            </div>
          </div>
          <Select value={queryTimeout} onValueChange={setQueryTimeout}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">5m (default)</SelectItem>
              <SelectItem value="10m">10m</SelectItem>
              <SelectItem value="15m">15m</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
