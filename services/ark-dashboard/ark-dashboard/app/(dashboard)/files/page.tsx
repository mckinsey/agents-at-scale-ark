'use client';

import { useAtomValue } from 'jotai';
import { RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';

import { isFilesBrowserAvailableAtom } from '@/atoms/experimental-features';
import { PageHeader } from '@/components/common/page-header';
import { FileAssistantSection } from '@/components/sections/file-assistant-section';
import { FilesSection } from '@/components/sections/files-section';
import { FilesSetupInstructions } from '@/components/sections/files-setup-instructions';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useGetFilesCount } from '@/lib/services/files-count-hooks';

const TAB_WORKSPACE = 'workspace';
const TAB_ASSISTANT = 'assistant';

export default function FilesPage() {
  const filesSectionRef = useRef<{ refresh: () => void }>(null);
  const isFilesBrowserAvailable = useAtomValue(isFilesBrowserAvailableAtom);
  const { data: filesCount } = useGetFilesCount();
  const [activeTab, setActiveTab] = useState<string>(TAB_WORKSPACE);

  const workspaceLabel =
    filesCount !== undefined ? `Workspace (${filesCount})` : 'Workspace';

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Files"
        actions={
          activeTab === TAB_WORKSPACE && isFilesBrowserAvailable ? (
            <Button onClick={() => filesSectionRef.current?.refresh()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col">
        <h1 className="text-xl">Files</h1>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="mt-2 flex flex-1 flex-col">
          <TabsList>
            <TabsTrigger value={TAB_WORKSPACE}>{workspaceLabel}</TabsTrigger>
            <TabsTrigger value={TAB_ASSISTANT}>Assistant</TabsTrigger>
          </TabsList>
          <TabsContent value={TAB_WORKSPACE} className="flex-1">
            {isFilesBrowserAvailable ? (
              <FilesSection ref={filesSectionRef} />
            ) : (
              <FilesSetupInstructions />
            )}
          </TabsContent>
          <TabsContent value={TAB_ASSISTANT} className="flex flex-1 flex-col">
            <FileAssistantSection />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
