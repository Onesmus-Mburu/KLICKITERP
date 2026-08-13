"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JournalResponseDto, PostJournalDto } from "@klickit/contracts";
import { createJournal, getJournal, listJournals, reverseJournal, type ListJournalsParams } from "../api/journals.api";

export const JOURNALS_QUERY_KEY = ["accounting", "journals"] as const;

function listKey(params: ListJournalsParams) {
  return [...JOURNALS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...JOURNALS_QUERY_KEY, "detail", id] as const;
}

/** `accounting:journal:view`-gated. Backs the journals list page's filter bar — `params` feeds `listJournals()` straight through, see that function's own doc comment for the conditional-query-object codegen workaround. */
export function useJournals(params: ListJournalsParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listJournals(params), enabled: options.enabled ?? true });
}

/** The journal detail page's primary data source — the only query that returns populated `lines`. */
export function useJournal(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getJournal(id as string), enabled: !!id });
}

function invalidateJournalQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: JOURNALS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

export function useCreateJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: PostJournalDto) => createJournal(dto),
    onSuccess: () => invalidateJournalQueries(queryClient),
  });
}

/** Invalidates both the original journal's detail (so `useJournalReversal()` re-fetches and the Reverse button disappears) and the new reversal journal's own detail. */
export function useReverseJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, narration }: { id: string; narration: string }) => reverseJournal(id, narration),
    onSuccess: (reversal, { id }) => {
      invalidateJournalQueries(queryClient, id);
      invalidateJournalQueries(queryClient, reversal.id);
    },
  });
}

/**
 * "Has this journal already been reversed?" for the detail page's Reverse
 * button — `JournalsController.list()` has no `reversalOfId` filter
 * (confirmed by reading it), and `PostingService.reverse()` has no
 * server-side guard against reversing the same journal twice (see
 * `journals.api.ts`'s own doc comment on `reverseJournal()`), so this is a
 * real, deliberate client-side check, not a redundant one.
 *
 * Judgment call (the plan's own brief explicitly left this open): rather
 * than either (a) an unbounded, unfiltered `GET /accounting/journals` scan
 * across every journal ever posted, or (b) always showing the button and
 * risking a silent duplicate reversal (confirmed above there is NO
 * server-side rejection to catch), this narrows the list call via
 * `sourceDocId` — `PostingService.reverse()`'s own body sets a reversal's
 * `sourceDocId` to the SAME value as the original's
 * (`sourceDocId: original.sourceDocId`), so filtering to
 * `sourceDocId: journal.sourceDocId` is GUARANTEED to include any existing
 * reversal of this journal (plus the journal itself, and possibly unrelated
 * sibling journals that happen to share that sourceDocId — harmless, just
 * scanned client-side for a `reversalOfId === journal.id` match) without an
 * unbounded full-table call.
 */
export function useJournalReversal(journal: Pick<JournalResponseDto, "id" | "sourceDocId"> | undefined) {
  const params: ListJournalsParams = journal ? { sourceDocId: journal.sourceDocId } : {};
  const query = useJournals(params, { enabled: !!journal });
  const reversedBy = query.data?.find((j) => j.reversalOfId === journal?.id);
  return { ...query, reversedBy };
}

export type { JournalResponseDto };
