"use client";

import { useQuery } from "@tanstack/react-query";
import { listFeeGroups } from "../api/fee-groups.api";

export function useFeeGroups() {
  return useQuery({
    queryKey: ["students", "fee-groups"],
    queryFn: listFeeGroups,
  });
}
