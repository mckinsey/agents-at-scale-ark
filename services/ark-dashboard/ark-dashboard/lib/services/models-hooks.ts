import { useQuery } from "@tanstack/react-query";
import { modelsService } from "./models";

export const GET_ALL_MODELS_QUERY_KEY = "get-all-models";

export const useGetAllModels = () => {
  return useQuery({
    queryKey: [GET_ALL_MODELS_QUERY_KEY],
    queryFn: modelsService.getAll
  });
};
