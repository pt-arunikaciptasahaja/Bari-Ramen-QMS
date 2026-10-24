import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, dailySummary, historyCsv, queueHistory } from "../src/lib/history";
import type { QueueEntry } from "../src/lib/queue";

const entry = (values: Partial<QueueEntry> = {}): QueueEntry => ({
  id: "one", queue_number: "A-001", customer_name: "Budi", pax: 2,
  source: "online", status: "waiting", created_at: "2026-10-15T03:00:00Z",
  called_at: null, service_date: "2026-10-15", ticket_sequence: 1,
  group_code: "A", request_id: "request", ...values,
});

test("history excludes active tickets and applies status and name/number filters", () => {
  const rows = [entry(), entry({ id: "called", status: "called" }),
    entry({ id: "seated", status: "seated", created_at: "2026-10-15T03:02:00Z" }),
    entry({ id: "missed", status: "no-show", customer_name: "Sari", queue_number: "B-001" })];
  assert.deepEqual(queueHistory(rows, "all").map((r) => r.id), ["seated", "missed"]);
  assert.equal(queueHistory(rows, "seated").length, 1);
  assert.equal(queueHistory(rows, "all", " sari ")[0].id, "missed");
  assert.equal(queueHistory(rows, "no-show", "b-001").length, 1);
  assert.equal(queueHistory(rows, "seated", "Sari").length, 0);
});

test("daily totals distinguish parties, pax, sources and called-only waiting time", () => {
  const summary = dailySummary([
    entry({ status: "seated", called_at: "2026-10-15T03:10:00Z" }),
    entry({ status: "seated", pax: 4, source: "walk-in", called_at: "2026-10-15T03:20:00Z" }),
    entry({ status: "no-show" }), entry({ status: "waiting" }),
  ]);
  assert.deepEqual(summary, { total: 4, seated: 2, seatedPax: 6, noShow: 1, online: 3, walkIn: 1, calledCount: 2, averageWaitMinutes: 15 });
  assert.equal(dailySummary([]).averageWaitMinutes, null);
  assert.equal(dailySummary([entry({ called_at: "invalid" })]).averageWaitMinutes, null);
  assert.equal(dailySummary([entry({ called_at: "2026-10-15T02:00:00Z" })]).averageWaitMinutes, null);
});

test("CSV preserves names and escapes commas, quotes, newlines and formulas", () => {
  assert.equal(csvCell('Budi, "A"'), '"Budi, ""A"""');
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.ok(csvCell(" @SUM(1)").startsWith('"\''));
  const csv = historyCsv([entry({ status: "no-show", customer_name: "Tamu\nBaru", edit_count: 2, last_edited_at: "2026-10-15T04:00:00Z" })]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Dilewati"'));
  assert.ok(csv.includes('"Tamu\nBaru"'));
  assert.ok(csv.includes("(ISO UTC)"));
  assert.ok(csv.includes("Jumlah pemulihan"));
  assert.ok(csv.includes('"2","2026-10-15T04:00:00Z"'));
});
