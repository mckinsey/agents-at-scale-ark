import { useMutation, useQuery } from '@tanstack/react-query';

import type { ListFilesParams } from '@/lib/types/files';
import { useNamespace } from '@/providers/NamespaceProvider';

import { filesService } from './files';

export const useListFiles = (params: ListFilesParams = {}) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: ['list-files', params, namespace],
    queryFn: () => filesService.list(namespace, params),
    enabled: Boolean(namespace),
  });
};

export const useUploadFile = () => {
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: ({
      file,
      prefix,
      onProgress,
    }: {
      file: File;
      prefix: string;
      onProgress?: (progress: number) => void;
    }) => filesService.upload(namespace, file, prefix, onProgress),
  });
};

export const useDeleteFile = () => {
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: (key: string) => filesService.delete(namespace, key),
  });
};

export const useDeleteDirectory = () => {
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: (prefix: string) =>
      filesService.deleteDirectory(namespace, prefix),
  });
};
