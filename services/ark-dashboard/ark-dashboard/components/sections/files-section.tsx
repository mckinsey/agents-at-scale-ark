'use client';

import copy from 'copy-to-clipboard';
import { useAtom } from 'jotai';
import { Fragment, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { filesBrowserPrefixAtom } from '@/atoms/internal-states';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { MultiTabPreviewDialog } from '@/components/file-preview/multi-tab-preview-dialog';
import {
  Add,
  Autorenew,
  ContentCopy,
  Folder,
  InsertDriveFile,
  MoreVert,
  SaveAlt,
  Trash,
} from '@/components/icons';
import { ResourceEmptyState } from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMultiFilePreview } from '@/hooks/use-multi-file-preview';
import { filesService } from '@/lib/services/files';
import { useGetFilesCount } from '@/lib/services/files-count-hooks';
import {
  useDeleteDirectory,
  useDeleteFile,
  useListFiles,
} from '@/lib/services/files-hooks';
import type { DirectoryItem, FileItem } from '@/lib/types/files';

const FILE_GATEWAY_DOCS_URL =
  'https://mckinsey.github.io/agents-at-scale-marketplace/services/file-gateway/';

const rowHoverOverlayClass =
  'pointer-events-none absolute inset-0 -z-10 transition-colors group-hover:bg-stateslayer-overlay-hover';

const MENU_CONTENT_CLASS =
  'w-[211px] rounded-none border-0 bg-surface-bg-tertiary';
const MENU_ITEM_CLASS =
  'text-fg-secondary rounded-none px-3 py-2 transition-colors hover:bg-stateslayer-overlay-hover hover:text-fg-primary focus:bg-stateslayer-overlay-hover focus:text-fg-primary';

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function parseBreadcrumbs(prefix: string): string[] {
  if (!prefix) return [];
  return prefix.split('/').filter(Boolean);
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-GB');
}

function RowActionsMenu({ children }: { children: React.ReactNode }) {
  return (
    <TableCell size="small" className="relative z-10">
      <div className="flex items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
              onClick={e => e.stopPropagation()}>
              <MoreVert className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={MENU_CONTENT_CLASS}
            onClick={e => e.stopPropagation()}>
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableCell>
  );
}

export function FilesSection() {
  const [prefix, setPrefix] = useAtom(filesBrowserPrefixAtom);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'file' | 'directory';
    key: string;
    name: string;
  } | null>(null);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [allDirectories, setAllDirectories] = useState<DirectoryItem[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use the multi-file preview hook
  const {
    previewOpen,
    tabs,
    activeTab,
    activeTabKey,
    handlePreview,
    closeTab,
    closeAllTabs,
    setActiveTabKey,
    setPreviewOpen,
  } = useMultiFilePreview();

  const {
    data: listFilesData,
    isLoading: listFilesLoading,
    isFetching: _listFilesFetching,
    isError: listFilesError,
    error: listFilesErrorObject,
    refetch: loadFiles,
  } = useListFiles({ prefix, max_keys: 100 });

  const deleteMutation = useDeleteFile();
  const deleteDirectoryMutation = useDeleteDirectory();

  const { data: filesCount } = useGetFilesCount();
  const pageTitle =
    filesCount === undefined ? 'Files' : `Files (${filesCount})`;

  useEffect(() => {
    if (listFilesData && !listFilesError) {
      setAllFiles(listFilesData.files);
      setAllDirectories(listFilesData.directories);
      setNextToken(listFilesData.next_token);
    }

    if (listFilesError) {
      if (prefix !== '') {
        setPrefix('');
      } else {
        toast.error('Failed to Load Files', {
          description:
            listFilesErrorObject instanceof Error
              ? listFilesErrorObject.message
              : 'An unexpected error occurred',
        });
      }
    }
  }, [listFilesError, listFilesData, listFilesErrorObject, prefix, setPrefix]);

  const handleNavigateToDirectory = (dirPrefix: string) => {
    setPrefix(dirPrefix);
    setAllFiles([]);
    setAllDirectories([]);
    setNextToken(undefined);
  };

  const handleBreadcrumbClick = (index: number) => {
    const segments = parseBreadcrumbs(prefix);
    const newPrefix = segments.slice(0, index + 1).join('/') + '/';
    handleNavigateToDirectory(newPrefix);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!assertFileSize(file)) {
        return;
      }

      setPendingFile(file);
      setFilename(file.name);
      setUploadDialogOpen(true);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const assertFileSize = (file: File) => {
    const MAX_FILE_SIZE = 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large', {
        description: (
          <span>
            Maximum allowed is 1MB, see the{' '}
            <a
              href="https://mckinsey.github.io/agents-at-scale-marketplace/services/file-gateway/#file-size-limitations"
              target="_blank"
              rel="noopener noreferrer"
              className="underline">
              File Gateway Service documentation
            </a>{' '}
            for more details.
          </span>
        ),
      });

      return false;
    }

    return true;
  };

  const handleDropZoneClick = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !filename.trim()) {
      toast.error('Please enter a filename');
      return;
    }

    setUploading(true);
    setUploadDialogOpen(false);

    try {
      const renamedFile = new File([pendingFile], filename, {
        type: pendingFile.type,
      });

      await filesService.upload(renamedFile, prefix);

      toast.success('File Uploaded Successfully');
      setPendingFile(null);
      setFilename('');
      loadFiles();
    } catch (error) {
      toast.error('Failed to Upload File', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setUploadDialogOpen(false);
    setPendingFile(null);
    setFilename('');
  };

  const handleDelete = (
    type: 'file' | 'directory',
    key: string,
    name: string,
  ) => {
    setDeleteTarget({ type, key, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'file') {
        await deleteMutation.mutateAsync(deleteTarget.key);
        toast.success('File Deleted');
      } else {
        const result = await deleteDirectoryMutation.mutateAsync(
          deleteTarget.key,
        );
        toast.success(`Directory Deleted (${result.deleted_count} files)`);
      }

      setAllFiles([]);
      setAllDirectories([]);
      setNextToken(undefined);
      loadFiles();
    } catch (error) {
      toast.error(
        `Failed to Delete ${deleteTarget.type === 'file' ? 'File' : 'Directory'}`,
        {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        },
      );
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleDownload = (key: string) => {
    filesService.download(key);
  };

  const handleCopySuccess = (path: string) => {
    toast.success('Path Copied', {
      description: `Copied "${path}" to clipboard`,
    });
  };

  const handleLoadMore = async () => {
    if (!nextToken) return;

    try {
      const moreData = await filesService.list({
        prefix,
        max_keys: 100,
        continuation_token: nextToken,
      });

      setAllFiles(prev => [...prev, ...moreData.files]);
      setAllDirectories(prev => [...prev, ...moreData.directories]);
      setNextToken(moreData.next_token);
    } catch (error) {
      toast.error('Failed to Load More Files', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const breadcrumbs = parseBreadcrumbs(prefix);
  const hasFiles = allFiles.length > 0 || allDirectories.length > 0;

  if (listFilesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading files...</p>
      </div>
    );
  }

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              <InsertDriveFile />
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              {pageTitle}
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Manage datasets, documents, and assets used by agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => loadFiles()}>
            <Autorenew className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={handleDropZoneClick}>
            <Add className="h-4 w-4" />
            Add file
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        aria-label="Browse files"
      />

      {prefix && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
          <button
            type="button"
            onClick={() => handleNavigateToDirectory('')}
            className="text-fg-disabled hover:text-fg-secondary cursor-pointer transition-colors">
            Files
          </button>
          {breadcrumbs.map((segment, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const segmentPath = breadcrumbs.slice(0, index + 1).join('/');
            return (
              <Fragment key={segmentPath}>
                <span aria-hidden="true" className="text-fg-secondary">
                  /
                </span>
                {isLast ? (
                  <span aria-current="page" className="text-fg-secondary">
                    {segment}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(index)}
                    className="text-fg-disabled hover:text-fg-secondary cursor-pointer transition-colors">
                    {segment}
                  </button>
                )}
              </Fragment>
            );
          })}
        </nav>
      )}

      {!hasFiles && !listFilesLoading && (
        <ResourceEmptyState
          icon={<InsertDriveFile />}
          title="No Files Yet"
          description={
            <>
              <p className="mb-2">This directory is empty.</p>
              <p>Upload your first file to get started.</p>
            </>
          }
          actions={
            <a
              href={FILE_GATEWAY_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer">
              <Button variant="outline">Learn more</Button>
            </a>
          }
        />
      )}

      {hasFiles && (
        <Table className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
          <TableHeader>
            <TableRow>
              <TableHead size="small">Name</TableHead>
              <TableHead size="small" className="w-[140px]">
                Size
              </TableHead>
              <TableHead size="small" className="w-[200px]">
                Last modified
              </TableHead>
              <TableHead size="small" className="w-[64px] text-center">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allDirectories.map(dir => (
              <TableRow
                key={dir.prefix}
                className="relative isolate cursor-pointer transition-colors"
                onClick={() => handleNavigateToDirectory(dir.prefix)}>
                <TableCell size="small">
                  <span aria-hidden className={rowHoverOverlayClass} />
                  <div className="flex min-w-0 items-center gap-2">
                    <IconShell size="sm" variant="secondary">
                      <Folder />
                    </IconShell>
                    <span className="text-fg-primary truncate">
                      {dir.prefix.split('/').filter(Boolean).pop()}/
                    </span>
                  </div>
                </TableCell>
                <TableCell size="small" className="text-fg-secondary">
                  —
                </TableCell>
                <TableCell size="small" className="text-fg-secondary">
                  —
                </TableCell>
                <RowActionsMenu>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onClick={() => {
                      copy(dir.prefix);
                      handleCopySuccess(dir.prefix);
                    }}>
                    <ContentCopy />
                    Copy path
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onClick={() =>
                      handleDelete(
                        'directory',
                        dir.prefix,
                        dir.prefix.split('/').filter(Boolean).pop() ||
                          dir.prefix,
                      )
                    }>
                    <Trash className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </RowActionsMenu>
              </TableRow>
            ))}
            {allFiles.map(file => (
              <TableRow
                key={file.key + file.etag}
                className="relative isolate cursor-pointer transition-colors"
                onClick={() => handlePreview(file.key)}>
                <TableCell size="small">
                  <span aria-hidden className={rowHoverOverlayClass} />
                  <div className="flex min-w-0 items-center gap-2">
                    <IconShell size="sm" variant="secondary">
                      <InsertDriveFile />
                    </IconShell>
                    <span className="text-fg-primary truncate">
                      {file.key.split('/').pop()}
                    </span>
                  </div>
                </TableCell>
                <TableCell size="small" className="text-fg-secondary">
                  {formatBytes(file.size)}
                </TableCell>
                <TableCell size="small" className="text-fg-secondary">
                  {formatDate(file.last_modified)}
                </TableCell>
                <RowActionsMenu>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onClick={() => {
                      copy(file.key);
                      handleCopySuccess(file.key);
                    }}>
                    <ContentCopy />
                    Copy path
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onClick={() => handleDownload(file.key)}>
                    <SaveAlt />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASS}
                    onClick={() =>
                      handleDelete(
                        'file',
                        file.key,
                        file.key.split('/').pop() || file.key,
                      )
                    }>
                    <Trash className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </RowActionsMenu>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextToken && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore}>
            Load More
          </Button>
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Enter the filename to save as in the current directory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="filename">Filename</Label>
              <div className="flex items-center gap-2">
                {prefix && (
                  <span className="text-muted-foreground font-mono text-sm">
                    /{prefix}
                  </span>
                )}
                <Input
                  id="filename"
                  value={filename}
                  onChange={e => setFilename(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleConfirmUpload();
                    }
                  }}
                  placeholder="filename.txt"
                  autoFocus
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelUpload}>
              Cancel
            </Button>
            <Button onClick={handleConfirmUpload} disabled={!filename.trim()}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title={
          deleteTarget?.type === 'file'
            ? `Delete ${deleteTarget.name}?`
            : `Delete directory and all contents?`
        }
        description={
          deleteTarget?.type === 'file'
            ? 'This action cannot be undone.'
            : `This will delete ${deleteTarget?.name} and ALL files inside. This action cannot be undone.`
        }
        variant="destructive"
      />

      <MultiTabPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        tabs={tabs}
        activeTab={activeTab}
        activeTabKey={activeTabKey}
        onTabClick={setActiveTabKey}
        onTabClose={closeTab}
        onCloseAll={closeAllTabs}
      />
    </div>
  );
}
