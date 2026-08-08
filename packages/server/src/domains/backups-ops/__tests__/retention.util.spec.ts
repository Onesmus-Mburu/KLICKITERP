import { classifyRetention, RetentionCandidate } from "../application/retention.util";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeCandidate(id: string, startedAt: Date): RetentionCandidate {
  return { id, startedAt };
}

describe("retention.util — classifyRetention (GFS 7 daily / 4 weekly / 12 monthly)", () => {
  it("returns an empty keep set for an empty input", () => {
    const { keepIds } = classifyRetention([]);
    expect(keepIds.size).toBe(0);
  });

  it("keeps EVERY run when there are fewer than the daily cap (5 consecutive days, all 5 survive) — and keeps EXACTLY 5, not more (no double-counting across tiers)", () => {
    const anchor = new Date("2026-03-15T02:00:00.000Z");
    const candidates: RetentionCandidate[] = [];
    for (let i = 0; i < 5; i += 1) {
      candidates.push(makeCandidate(`run-${i}`, new Date(anchor.getTime() - i * MS_PER_DAY)));
    }

    const { keepIds } = classifyRetention(candidates);

    expect(keepIds.size).toBe(5);
    for (const candidate of candidates) {
      expect(keepIds.has(candidate.id)).toBe(true);
    }
  });

  it(
    "with 20 runs spaced exactly 40 days apart (guaranteeing each lands in its own distinct day/week/month bucket — 40 days safely exceeds both the 7-day rolling-week bucket size and the longest possible calendar month), " +
      "the union collapses to EXACTLY the 12 most recent (the monthly tier's cap is the largest and, since daily's 7-most-recent and weekly's 4-most-recent are BOTH strict subsets of monthly's 12-most-recent under this construction, " +
      "the union is exactly 12 — this also rules out a 'sum instead of union' bug, which would incorrectly try to keep up to 7+4+12=23 distinct slots (i.e. all 20) instead of 12)",
    () => {
      const anchor = new Date("2026-06-01T12:00:00.000Z");
      const STEP_DAYS = 40;
      const candidates: RetentionCandidate[] = [];
      // ids[0] is the NEWEST (i=0 -> anchor itself), ids[19] is the OLDEST.
      for (let i = 0; i < 20; i += 1) {
        candidates.push(makeCandidate(`run-${i}`, new Date(anchor.getTime() - i * STEP_DAYS * MS_PER_DAY)));
      }

      const { keepIds } = classifyRetention(candidates);

      expect(keepIds.size).toBe(12);
      for (let i = 0; i < 12; i += 1) {
        expect(keepIds.has(`run-${i}`)).toBe(true);
      }
      for (let i = 12; i < 20; i += 1) {
        expect(keepIds.has(`run-${i}`)).toBe(false);
      }
    },
  );

  it("when multiple runs land on the SAME calendar day, only the most recent one is that day's representative (older same-day runs are pruned unless a different tier also keeps them)", () => {
    const day = new Date("2026-06-01T00:00:00.000Z");
    const candidates: RetentionCandidate[] = [
      makeCandidate("morning", new Date(day.getTime() + 6 * 60 * 60 * 1000)),
      makeCandidate("noon", new Date(day.getTime() + 12 * 60 * 60 * 1000)),
      makeCandidate("evening", new Date(day.getTime() + 20 * 60 * 60 * 1000)), // latest of the three same-day runs
    ];

    const { keepIds } = classifyRetention(candidates);

    expect(keepIds.has("evening")).toBe(true);
    expect(keepIds.has("morning")).toBe(false);
    expect(keepIds.has("noon")).toBe(false);
    expect(keepIds.size).toBe(1);
  });

  it("is order-independent — shuffling the input candidate array produces the same keep set", () => {
    const anchor = new Date("2026-01-01T00:00:00.000Z");
    const candidates: RetentionCandidate[] = [];
    for (let i = 0; i < 20; i += 1) {
      candidates.push(makeCandidate(`run-${i}`, new Date(anchor.getTime() - i * 40 * MS_PER_DAY)));
    }
    const shuffled = [...candidates].reverse();

    const forward = classifyRetention(candidates);
    const reversed = classifyRetention(shuffled);

    expect([...forward.keepIds].sort()).toEqual([...reversed.keepIds].sort());
  });
});
