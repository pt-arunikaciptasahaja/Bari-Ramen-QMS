import test from "node:test";
import assert from "node:assert/strict";
import { whatsappLink, whatsappMessage, whatsappState } from "../src/lib/whatsapp";
import type { QueueEntry } from "../src/lib/queue";

const start = Date.parse("2026-10-16T03:00:00Z");
const entry = {
  customer_name: "Budi & keluarga", customer_phone: "0812-3456-7890", queue_number: "B-006",
  status: "called", call_count: 1, called_at: new Date(start).toISOString(), service_date: "2026-10-16",
} as QueueEntry;

test("WhatsApp is available immediately on every call without a timer", () => {
  for (const call_count of [1, 2, 3]) {
    for (const now of [start, start + 1, start + 179999]) {
      const row = {...entry, call_count};
      assert.equal(whatsappState(row, now).enabled, true);
      assert.ok(whatsappLink(row, now));
    }
  }
});

test("waiting guests can be contacted before the first call without a misleading call message", () => {
  const waiting = {...entry, status:'waiting', called_at:null, call_count:0} as QueueEntry;
  assert.equal(whatsappState(waiting, start).enabled, true);
  const link = new URL(whatsappLink(waiting, start)!);
  assert.equal(link.pathname, '/6281234567890');
  assert.match(link.searchParams.get('text')!, /masih dalam daftar tunggu/);
  assert.doesNotMatch(link.searchParams.get('text')!, /sudah dipanggil|segera menuju kasir/);
  assert.match(whatsappMessage(entry), /sudah dipanggil/);
});

test("WhatsApp blocks terminal, missing-phone, malformed-phone and previous-day tickets", () => {
  for (const status of ['waiting', 'called'] as const) {
    for (const patch of [
      { status: "seated" }, { status: "no-show" },
      { customer_phone: null }, { customer_phone: "not-a-number" },
      { service_date: "2026-10-15" },
    ]) {
      const row = { ...entry, status, ...patch } as QueueEntry;
      assert.equal(whatsappState(row, start).enabled, false);
      assert.equal(whatsappLink(row, start), null);
    }
  }
  for (const now of [0, NaN, Infinity]) assert.equal(whatsappState(entry, now).enabled, false);
});

test("WhatsApp link targets the normalized number and preserves encoded message text", () => {
  const link = new URL(whatsappLink(entry, start)!);
  assert.equal(link.origin, "https://wa.me");
  assert.equal(link.pathname, "/6281234567890");
  assert.equal(link.searchParams.get("text"), whatsappMessage(entry));
  assert.ok(link.searchParams.get("text")?.includes("Budi & keluarga"));
  assert.ok(link.searchParams.get("text")?.includes("B-006"));
});

test("contact expires at the Jakarta service-day boundary", () => {
  assert.equal(whatsappState(entry, Date.parse('2026-10-16T16:59:59Z')).enabled, true);
  assert.equal(whatsappState(entry, Date.parse('2026-10-16T17:00:00Z')).enabled, false);
});
