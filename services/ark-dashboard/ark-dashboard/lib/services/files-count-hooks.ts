import { useQuery } from '@tanstack/react-query';

import { filesService } from './files';

export const GET_FILES_COUNT_QUERY_KEY = 'get-files-count';

export const useGetFilesCount = () => {
  return useQuery({
    queryKey: [GET_FILES_COUNT_QUERY_KEY],
    queryFn: async () => {
      const result = await filesService.list({ prefix: '', max_keys: 1000 });
      const totalFiles = result.files.length;
      let nextToken = result.next_token;
      let currentTotal = totalFiles;

      while (nextToken && currentTotal < 10000) {
        const nextResult = await filesService.list({
          prefix: '',
          max_keys: 1000,
          continuation_token: nextToken,
        });
        currentTotal += nextResult.files.length;
        nextToken = nextResult.next_token;
      }

      return currentTotal;
    },
    staleTime: 30000,
  });
};
