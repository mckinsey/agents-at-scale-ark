"use client"

import { useParams, useSearchParams } from "next/navigation";
import { useState , useEffect} from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb"
import { toolsService } from "@/lib/services";
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ToolDetail } from "@/lib/services/tools";


const FIELD_HEADING_STYLES = "px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left"


export default function ToolDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const namespace = searchParams.get("namespace") || "default";
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const toolName = params.name as string;

  useEffect(() => {
    const fetchTool = async () => {
      if (!toolName) return;

      setLoading(true);
      try {
        const toolData = await toolsService.getDetail("default", toolName); // Fetch tool details
        setTool(toolData);
      } catch (error) {
        console.error("Failed to fetch tool details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTool();
  }, [toolName]);


  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <>
         <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
            <BreadcrumbLink href={`/tools?namespace=${namespace}`}>
                Tools
            </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{toolName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      {/* Tool Details Content */}
      <div className="m-4">
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Tool description</h3>
            </div>
            <table className="w-full">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Name
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {toolName}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Description
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                    {tool?.description ?? null}
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Tool type
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {tool?.spec?.type ?? null}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mt-5">
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b">
              <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">Annotations and metadata</h3>
            </div>
            <table className="w-full">
              <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Status
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                  {JSON.stringify(tool?.status?.state)}
                </td>
              </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className={FIELD_HEADING_STYLES}>
                    Input schema
                  </td>
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