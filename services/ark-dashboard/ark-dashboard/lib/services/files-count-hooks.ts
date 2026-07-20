import { useQuery } from '@tanstack/react-query';

import { filesService } from './files';

export const GET_FILES_COUNT_QUERY_KEY = 'get-files-count';

const MAX_FILES_COUNT = 10000;
const MAX_KEYS_PER_REQUEST = 1000;

async function countFilesRecursively(): Promise<number> {
  let total = 0;
  let frontier = [''];

  while (frontier.length > 0 && total < MAX_FILES_COUNT) {
    const nextFrontier: string[] = [];

    for (const prefix of frontier) {
      if (total >= MAX_FILES_COUNT) break;

      let continuationToken: string | undefined;
      do {
        const result = await filesService.list({
          prefix,
          max_keys: MAX_KEYS_PER_REQUEST,
          continuation_token: continuationToken,
        });
        total += result.files.length;
        nextFrontier.push(
          ...result.directories.map(directory => directory.prefix),
        );
        continuationToken = result.next_token;
      } while (continuationToken && total < MAX_FILES_COUNT);
    }

    frontier = nextFrontier;
  }

  return total;
}

export const useGetFilesCount = () => {
  return useQuery({
    queryKey: [GET_FILES_COUNT_QUERY_KEY],
    queryFn: countFilesRecursively,
    staleTime: 30000,
  });
};
