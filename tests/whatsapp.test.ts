import test from "node:test";
import assert from "node:assert/strict";
import { whatsappLink, whatsappMessage, whatsappState } from "../src/lib/whatsapp";
import type { QueueEntry } from "../src/lib/queue";

const start = Date.parse("2026-10-16T03:00:00Z");
const entry = {
  customer_name: "Budi & keluarga", customer_phone: "0812-3456-7890", queue_number: "B-006",
  status: "called", call_count: 1, called_at: new Date(start).toISOString(), service_date: "2026-10-16",
} as QueueEntry;

test("WhatsApp unlocks at 180 seconds from first call, independently of TV sound", () => {
  assert.equal(whatsappState(entry, start).remaining, 180);
  assert.equal(whatsappState(entry, start + 179999).enabled, false);
  assert.equal(whatsappState(entry, start + 180000).enabled, true);
  assert.equal(whatsappState(entry, start + 180000).remaining, 0);
  assert.equal(whatsappLink(entry, start + 179999), null);
});

test("WhatsApp blocks terminal, waiting, missing, malformed, future and expired tickets", () => {
  for (const patch of [
    { status: "waiting" }, { status: "seated" }, { status: "no-show" },
    { call_count: 0 }, { customer_phone: null }, { customer_phone: "not-a-number" },
    { called_at: null }, { called_at: "invalid" },
    { called_at: new Date(start + 240000).toISOString() }, { service_date: "2026-10-15" },
  ]) {
    const row = { ...entry, ...patch } as QueueEntry;
    assert.equal(whatsappState(row, start + 180000).enabled, false);
    assert.equal(whatsappLink(row, start + 180000), null);
  }
  assert.equal(whatsappState(entry, 0).enabled, false);
  assert.equal(whatsappState(entry, NaN).enabled, false);
});

test("WhatsApp link targets the normalized number and preserves encoded message text", () => {
  const link = new URL(whatsappLink(entry, start + 180000)!);
  assert.equal(link.origin, "https://wa.me");
  assert.equal(link.pathname, "/6281234567890");
  assert.equal(link.searchParams.get("text"), whatsappMessage(entry));
  assert.ok(link.searchParams.get("text")?.includes("Budi & keluarga"));
  assert.ok(link.searchParams.get("text")?.includes("B-006"));
});
