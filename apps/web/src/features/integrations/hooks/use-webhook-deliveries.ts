"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listWebhookDeliveries, processDueWebhookDeliveries, retryWebhookDelivery, type ListWebhookDeliveriesParams } from "../api/webhook-deliveries.api";

export const WEBHOOK_DELIVERIES_QUERY_KEY = ["integrations", "webhook-deliveries"] as const;

function listKey(params: ListWebhookDeliveriesParams) {
  return [...WEBHOOK_DELIVERIES_QUERY_KEY, "list", params] as const;
}

export function useWebhookDeliveries(params: ListWebhookDeliveriesParams) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listWebhookDeliveries(params) });
}

export function useRetryWebhookDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryWebhookDelivery(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WEBHOOK_DELIVERIES_QUERY_KEY }),
  });
}

/** No scheduler exists anywhere in this codebase — this is the deliberate, manually-triggered admin substitute (`WebhookDeliveryService.processDue()`'s own class doc comment). */
export function useProcessDueWebhookDeliveries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => processDueWebhookDeliveries(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WEBHOOK_DELIVERIES_QUERY_KEY }),
  });
}
