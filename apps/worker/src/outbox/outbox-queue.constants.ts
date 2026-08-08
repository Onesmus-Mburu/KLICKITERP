/** BullMQ queue carrying only the outbox dispatcher's own poll trigger — no real business jobs exist yet (see `OutboxQueueModule`'s doc comment for the honest scope note). */
export const OUTBOX_POLL_QUEUE = "outbox-poll";
export const OUTBOX_POLL_JOB_NAME = "poll";
/** Fixed, stable across restarts — BullMQ's repeatable-job registration is idempotent keyed on (name, repeat options, jobId); re-adding this on every worker boot does not create a duplicate schedule. */
export const OUTBOX_POLL_REPEAT_JOB_ID = "outbox-poll-repeatable";
