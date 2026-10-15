import test from "node:test";
import assert from "node:assert/strict";
import {
  activeQueue,
  aheadCount,
  canTransition,
  groupFor,
  serviceDate,
  validateGuest,
  type BoardEntry,
} from "../src/lib/queue";
function row(n: number, group = "A", status = "waiting"): BoardEntry {
  return {
    id: String(n),
    ticket_sequence: n,
    queue_number: `${group}-${n}`,
    group_code: group,
    status,
    service_date: "2026-10-15",
    created_at: `2026-10-15T00:${String(n).padStart(2, "0")}:00Z`,
    called_at: null,
    pax: 2,
    source: "online",
  } as BoardEntry;
}
test("group boundaries include large parties", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 12].map(groupFor), [
    "A",
    "A",
    "B",
    "B",
    "C",
    "C",
  ]);
});
test("validation rejects empty names, fractional, missing, oversized pax", () => {
  for (const name of ["", "  ", "a".repeat(61)])
    assert.throws(() => validateGuest(name, 2));
  for (const pax of [0, -1, 1.5, NaN, 13])
    assert.throws(() => validateGuest("Iki", pax));
  assert.doesNotThrow(() => validateGuest(" Iki ", 12));
});
test("service day rolls over at Jakarta midnight, not UTC", () => {
  assert.equal(serviceDate(new Date("2026-10-14T16:59:59Z")), "2026-10-14");
  assert.equal(serviceDate(new Date("2026-10-14T17:00:00Z")), "2026-10-15");
});
test("position includes called parties ahead, excludes other groups and terminal tickets", () => {
  const ticket = row(5);
  const rows = [
    row(1),
    row(2, "A", "called"),
    row(3, "B"),
    row(4, "A", "seated"),
    ticket,
    row(6),
  ];
  assert.equal(aheadCount(rows, ticket), 2);
});
test("active queue excludes yesterday and sorts FIFO", () => {
  const old = { ...row(1), service_date: "2026-10-14" };
  assert.deepEqual(
    activeQueue(
      [row(3), old, row(2, "A", "no-show"), row(1)],
      "2026-10-15",
    ).map((r) => r.id),
    ["1", "3"],
  );
});
test("status machine prevents duplicate calls and reactivating terminal tickets", () => {
  assert.equal(canTransition("waiting", "called"), true);
  assert.equal(canTransition("called", "seated"), true);
  assert.equal(canTransition("waiting", "seated"), false);
  assert.equal(canTransition("called", "called"), false);
  assert.equal(canTransition("seated", "waiting"), false);
  assert.equal(canTransition("no-show", "called"), false);
});
