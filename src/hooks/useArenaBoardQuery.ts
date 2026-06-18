"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  arenaBoardQueryKey,
  fetchArenaBoard,
  type ArenaBoardQueryParams,
} from "@/lib/arena-client-api";

export function useArenaBoardQuery(
  params: ArenaBoardQueryParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: arenaBoardQueryKey(params),
    queryFn: () => fetchArenaBoard(params),
    placeholderData: keepPreviousData,
    staleTime: 2_000,
    enabled: options?.enabled ?? true,
  });
}
