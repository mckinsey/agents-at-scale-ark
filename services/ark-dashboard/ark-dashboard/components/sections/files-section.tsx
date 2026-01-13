'use client';

import copy from 'copy-to-clipboard';
import { useAtom } from 'jotai';
import {
  ChevronLeft,
  Copy,
  Download,
  FileIcon,
  FolderIcon,
  MoreVertical,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { filesBrowserPrefixAtom } from '@/atoms/internal-states';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { filesService } from '@/lib/services/files';
import {
  useDeleteDirectory,
  useDeleteFile,
  useListFiles,
} from '@/lib/services/files-hooks';
import type { DirectoryItem, FileItem } from '@/lib/types/files';
import { formatAge } from '@/lib/utils/time';

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

export const FilesSection = forwardRef<{ refresh: () => void }>(
  function FilesSection(_, ref) {
    const [prefix, setPrefix] = useAtom(filesBrowserPrefixAtom);
    const [uploadProgress, setUploadProgress] = useState(0);
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
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    useImperativeHandle(ref, () => ({
      refresh: () => {
        loadFiles();
      },
    }));

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
    }, [
      listFilesError,
      listFilesData,
      listFilesErrorObject,
      prefix,
      setPrefix,
    ]);

    const handleNavigateToDirectory = (dirPrefix: string) => {
      setPrefix(dirPrefix);
      setAllFiles([]);
      setAllDirectories([]);
      setNextToken(undefined);
    };

    const handleGoUp = () => {
      const segments = parseBreadcrumbs(prefix);
      if (segments.length > 0) {
        segments.pop();
        const newPrefix = segments.length > 0 ? segments.join('/') + '/' : '';
        handleNavigateToDirectory(newPrefix);
      }
    };

    const handleBreadcrumbClick = (index: number) => {
      const segments = parseBreadcrumbs(prefix);
      const newPrefix = segments.slice(0, index + 1).join('/') + '/';
      handleNavigateToDirectory(newPrefix);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const file = files[0];
        if (!assertFileSize(file)) {
          return;
        }

        setPendingFile(file);
        setFilename(file.name);
        setUploadDialogOpen(true);
      }
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
      setUploadProgress(0);
      setUploadDialogOpen(false);

      try {
        const renamedFile = new File([pendingFile], filename, {
          type: pendingFile.type,
        });

        await filesService.upload(renamedFile, prefix, progress => {
          setUploadProgress(progress);
        });

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
        setUploadProgress(0);
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
      <div className="flex flex-1 flex-col gap-4 p-4">
        {prefix && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoUp}
              disabled={!prefix}>
              <ChevronLeft className="h-4 w-4" />
              Go Up
            </Button>
            <div className="text-muted-foreground flex items-center gap-1 font-mono text-sm">
              <span>/</span>
              {breadcrumbs.map((segment, index) => (
                <span key={index}>
                  <button
                    onClick={() => handleBreadcrumbClick(index)}
                    className="hover:text-primary hover:underline">
                    {segment}
                  </button>
                  <span className="mx-1">/</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {!hasFiles && !listFilesLoading && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DASHBOARD_SECTIONS.files.icon />
              </EmptyMedia>
              <EmptyTitle>No Files Yet</EmptyTitle>
              <EmptyDescription>
                This directory is empty. Upload your first file to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent></EmptyContent>
          </Empty>
        )}

        {hasFiles && (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">
                      Size
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">
                      Last Modified
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allDirectories.map(dir => (
                    <tr
                      key={dir.prefix}
                      className="cursor-pointer border-b border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30"
                      onClick={() => handleNavigateToDirectory(dir.prefix)}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <FolderIcon className="text-muted-foreground h-4 w-4" />
                          <span>
                            {dir.prefix.split('/').filter(Boolean).pop()}/
                          </span>
                        </div>
                      </td>
                      <td className="text-muted-foreground px-3 py-3 text-sm">
                        —
                      </td>
                      <td className="text-muted-foreground px-3 py-3 text-sm">
                        —
                      </td>
                      <td className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={e => e.stopPropagation()}
                              aria-label="More actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={e => {
                                e.stopPropagation();
                                copy(dir.prefix);
                                handleCopySuccess(dir.prefix);
                              }}>
                              <Copy className="h-4 w-4" />
                              Copy Path
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={e => {
                                e.stopPropagation();
                                handleDelete(
                                  'directory',
                                  dir.prefix,
                                  dir.prefix.split('/').filter(Boolean).pop() ||
                                    dir.prefix,
                                );
                              }}>
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {allFiles.map(file => (
                    <tr
                      key={file.key + file.etag}
                      className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <FileIcon className="text-muted-foreground h-4 w-4" />
                          <span>{file.key.split('/').pop()}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground px-3 py-3 text-sm">
                        {formatBytes(file.size)}
                      </td>
                      <td className="text-muted-foreground px-3 py-3 text-sm">
                        {formatAge(new Date(file.last_modified))}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(file.key)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="More actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  copy(file.key);
                                  handleCopySuccess(file.key);
                                }}>
                                <Copy className="h-4 w-4" />
                                Copy Path
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  handleDelete(
                                    'file',
                                    file.key,
                                    file.key.split('/').pop() || file.key,
                                  )
                                }>
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {nextToken && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleLoadMore}>
              Load More
            </Button>
          </div>
        )}

        <div
          className={`mt-auto rounded-lg border-2 border-dashed p-8 transition-colors ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30'
          } ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleDropZoneClick}>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileInputChange}
            aria-label="Browse files"
          />
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <UploadIcon className="text-muted-foreground h-8 w-8" />
            <p className="text-sm font-medium">
              {uploading
                ? 'Uploading...'
                : 'Drag and drop a file here or click to browse'}
            </p>
            {uploading && (
              <div className="mt-2 flex w-full max-w-xs items-center gap-2">
                <Progress value={uploadProgress} className="flex-1" />
                <span className="text-muted-foreground text-sm">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
            )}
          </div>
        </div>

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
      </div>
    );
  },
);
