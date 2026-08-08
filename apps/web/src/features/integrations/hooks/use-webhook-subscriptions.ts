"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateWebhookSubscriptionDto, UpdateWebhookSubscriptionDto } from "@klickit/contracts";
import {
  createWebhookSubscription,
  disableWebhookSubscription,
  enableWebhookSubscription,
  getWebhookSubscription,
  listWebhookSubscriptions,
  rotateWebhookSecret,
  updateWebhookSubscription,
} from "../api/webhook-subscriptions.api";

export const WEBHOOK_SUBSCRIPTIONS_QUERY_KEY = ["integrations", "webhook-subscriptions"] as const;

function listKey() {
  return [...WEBHOOK_SUBSCRIPTIONS_QUERY_KEY, "list"] as const;
}
function detailKey(id: string | undefined) {
  return [...WEBHOOK_SUBSCRIPTIONS_QUERY_KEY, "detail", id] as const;
}

export function useWebhookSubscriptions() {
  return useQuery({ queryKey: listKey(), queryFn: listWebhookSubscriptions });
}

export function useWebhookSubscription(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getWebhookSubscription(id as string), enabled: !!id });
}

export function useCreateWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebhookSubscriptionDto) => createWebhookSubscription(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey() }),
  });
}

export function useUpdateWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWebhookSubscriptionDto }) => updateWebhookSubscription(id, input),
    onSuccess: (subscription) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(subscription.id) });
    },
  });
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, secret }: { id: string; secret: string }) => rotateWebhookSecret(id, secret),
    onSuccess: (subscription) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(subscription.id) });
    },
  });
}

export function useDisableWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => disableWebhookSubscription(id, reason),
    onSuccess: (subscription) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(subscription.id) });
    },
  });
}

export function useEnableWebhookSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enableWebhookSubscription(id),
    onSuccess: (subscription) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(subscription.id) });
    },
  });
}
