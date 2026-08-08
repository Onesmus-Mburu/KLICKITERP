"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignOperatorDto, CreateServicePointDto, UpdateServicePointDto } from "@klickit/contracts";
import {
  assignServicePointOperator,
  createServicePoint,
  getServicePoint,
  listServicePointOperators,
  listServicePoints,
  unassignServicePointOperator,
  updateServicePoint,
} from "../api/service-points.api";

export const SERVICE_POINTS_QUERY_KEY = ["wallet", "service-points"] as const;

function detailKey(id: string | undefined) {
  return [...SERVICE_POINTS_QUERY_KEY, "detail", id] as const;
}
function operatorsKey(id: string | undefined) {
  return [...SERVICE_POINTS_QUERY_KEY, "operators", id] as const;
}

/** Read-only list, backing the Spend dialog's service-point `<Select>` AND (Phase 6 Slice 11 Part 3) the new Service Points admin list page. */
export function useServicePoints() {
  return useQuery({
    queryKey: SERVICE_POINTS_QUERY_KEY,
    queryFn: () => listServicePoints(),
  });
}

export function useServicePoint(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getServicePoint(id as string),
    enabled: !!id,
  });
}

export function useServicePointOperators(id: string | undefined) {
  return useQuery({
    queryKey: operatorsKey(id),
    queryFn: () => listServicePointOperators(id as string),
    enabled: !!id,
  });
}

export function useCreateServicePoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateServicePointDto) => createServicePoint(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SERVICE_POINTS_QUERY_KEY }),
  });
}

export function useUpdateServicePoint(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateServicePointDto) => updateServicePoint(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: SERVICE_POINTS_QUERY_KEY });
    },
  });
}

export function useAssignServicePointOperator(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AssignOperatorDto) => assignServicePointOperator(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: operatorsKey(id) }),
  });
}

export function useUnassignServicePointOperator(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => unassignServicePointOperator(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: operatorsKey(id) }),
  });
}
