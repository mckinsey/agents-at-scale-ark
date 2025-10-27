'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { toolsService } from '@/lib/services';
import type { ToolDetail } from '@/lib/services/tools';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/tools', label: 'Tools' },
];

const FIELD_HEADING_STYLES =
  'px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left';

export default function ToolDetailsPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const toolName = params.name as string;

  useEffect(() => {
    const fetchTool = async () => {
      if (!toolName) return;

      setLoading(true);
      try {
        const toolData = await toolsService.getDetail(toolName); // Fetch tool details
        setTool(toolData);
      } catch (error) {
        console.error('Failed to fetch tool details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTool();
  }, [toolName]);

  if (loading) {
    return <div className="py-8 text-center">Loading...</div>;
  }

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage={toolName} />
      {/* Tool Details Content */}
      <div className="m-4">
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
            <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Tool description
            </h3>
          </div>
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className={FIELD_HEADING_STYLES}>Name</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {toolName}
                </td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className={FIELD_HEADING_STYLES}>Description</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {tool?.description ?? null}
                </td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className={FIELD_HEADING_STYLES}>Tool type</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {tool?.spec?.type ?? null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
            <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Annotations and metadata
            </h3>
          </div>
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className={FIELD_HEADING_STYLES}>Status</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {JSON.stringify(tool?.status?.state)}
                </td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className={FIELD_HEADING_STYLES}>Input schema</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(tool?.spec?.inputSchema, null, 2)}
                  </pre>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
