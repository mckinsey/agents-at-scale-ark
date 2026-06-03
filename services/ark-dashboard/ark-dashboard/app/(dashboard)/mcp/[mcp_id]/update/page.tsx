'use client';

import { use } from 'react';

import { UpdateMcpServerForm } from '@/components/forms';
import { Spinner } from '@/components/ui/spinner';
import { useGetMcpServerByName } from '@/lib/services/mcp-servers-hooks';

type PageProps = {
  params: Promise<{ mcp_id: string }>;
};

export default function McpServerUpdatePage({ params }: PageProps) {
  const { mcp_id: mcpId } = use(params);
  const { data, isPending } = useGetMcpServerByName(mcpId);

  if (isPending) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return data ? <UpdateMcpServerForm server={data} /> : null;
}
