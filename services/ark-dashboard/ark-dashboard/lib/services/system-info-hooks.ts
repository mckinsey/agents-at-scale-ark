import { useQuery } from '@tanstack/react-query';

import { systemInfoService } from './system-info';

export const GET_SYSTEM_INFO_QUERY_KEY = 'get-system-info';

export const useGetSystemInfo = () => {
  return useQuery({
    queryKey: [GET_SYSTEM_INFO_QUERY_KEY],
    queryFn: () => systemInfoService.get(),
  });
};
