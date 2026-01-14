import { useMutation, useQuery } from '@tanstack/react-query';

import type { ListFilesParams } from '@/lib/types/files';

import { filesService } from './files';

export const useListFiles = (params: ListFilesParams = {}) => {
  return useQuery({
    queryKey: ['list-files', params],
    queryFn: () => filesService.list(params),
  });
};

export const useUploadFile = () => {
  return useMutation({
    mutationFn: ({
      file,
      prefix,
      onProgress,
    }: {
      file: File;
      prefix: string;
      onProgress?: (progress: number) => void;
    }) => filesService.upload(file, prefix, onProgress),
  });
};

export const useDeleteFile = () => {
  return useMutation({
    mutationFn: (key: string) => filesService.delete(key),
  });
};

export const useDeleteDirectory = () => {
  return useMutation({
    mutationFn: (prefix: string) => filesService.deleteDirectory(prefix),
  });
};
