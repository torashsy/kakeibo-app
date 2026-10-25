import { describe, expect, it } from "vitest";
import { cardClaimStates, entryDate, pendingCardClaims, upcomingDebits, type Card, type Config, type Entry } from "./utils";
import { financeEntryBase, isUnmodifiedFinanceEntry, mergeFinanceObservations, normalizeFinanceFeed, type FinanceFeed, type FinanceObservation } from "./finance";

const config: Config = { accounts: ["NEOBANK", "ゆうちょ"], salaryItems: [], cycleCutoffDay: 10 };
const cards: Card[] = [{ id: "smcc-1", name: "SMCC Gold", paymentDay: 10, cutoffDay: 15 }];
const bill = (overrides: Partial<FinanceObservation> = {}): FinanceObservation => ({
  id: "mail:bill-1",
  kind: "card_bill",
  cardName: "SMCC Gold",
  amount: 12500,
  dueDate: "2026-11-10",
  issuedAt: "2026-10-24T09:00:00+09:00",
  receivedAt: "2026-10-24T09:01:00+09:00",
  status: "confirmed",
  ...overrides,
});
const balance = (overrides: Partial<FinanceObservation> = {}): FinanceObservation => ({
  id: "mail:balance-1",
  kind: "balance",
  account: "NEOBANK",
  amount: 100000,
  asOf: "2026-10-25",
  issuedAt: "2026-10-25T09:00:00+09:00",
  receivedAt: "2026-10-25T09:01:00+09:00",
  status: "confirmed",
  ...overrides,
});
const feed = (...observations: FinanceObservation[]): FinanceFeed => ({
  version: 1,
  checkedAt: "2026-10-25T12:00:00+09:00",
  observations: Object.fromEntries(observations.map((observation, i) => [`source-${i}`, observation])),
  sources: [],
});
const merge = (entries: Entry[], ...observations: FinanceObservation[]) => mergeFinanceObservations(entries, feed(...observations), config, cards);
const manualBill = (overrides: Partial<Entry> = {}): Entry => ({
  id: "manual-1", ym: "2026-10", cat: "card", item: "SMCC Gold", amount: 12500, account: "", ...overrides,
});

describe("finance feed: confirmed bill integration", () => {
  it("uses the payment cycle, preserves evidence, and does not mark a future bill paid", () => {
    const input: Entry[] = [];
    const out = merge(input, bill());
    expect(input).toEqual([]);
    expect(out.changed).toBe(true);
    expect(out.results[0].status).toBe("applied");
    expect(out.entries).toHaveLength(1);
    const entry = out.entries[0];
    expect(entry).toMatchObject({ ym: "2026-10", cat: "card", item: "SMCC Gold", amount: 12500, autoDueDate: "2026-11-10", autoLogicalKey: "bill:smcc-1:2026-10", autoSourceId: "mail:bill-1", autoStatus: "confirmed" });
    expect(entryDate(entry)).toBeUndefined();
    expect(entry.src).toBeUndefined();
    expect(cardClaimStates(cards, {}, [], out.entries, "2026-10", 10)[0].status).toBe("confirmed");
    expect(isUnmodifiedFinanceEntry(entry)).toBe(true);
  });

  it("replaying the same feed preserves the array reference and never adds a second expense", () => {
    const first = merge([], bill());
    const second = merge(first.entries, bill());
    expect(second.entries).toBe(first.entries);
    expect(second.entries).toHaveLength(1);
    expect(second.changed).toBe(false);
    expect(second.results[0].status).toBe("matched");
  });

  it("matches the whole existing card-cycle total without adding the statement", () => {
    const existing = [manualBill({ amount: 7500 }), manualBill({ id: "manual-2", amount: 5000, date: "2026-11-10" })];
    const out = merge(existing, bill());
    expect(out.entries).toBe(existing);
    expect(out.results[0].status).toBe("matched");
  });

  it("never overwrites a different manual or CSV total", () => {
    const existing = [manualBill({ amount: 5000, src: "2026-11-10|-5000|ミツイスミトモ" })];
    const out = merge(existing, bill());
    expect(out.entries).toBe(existing);
    expect(out.results[0].status).toBe("conflict");
  });

  it("accepts a confirmed zero bill without confusing it with an absent amount", () => {
    const out = merge([], bill({ amount: 0 }));
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ amount: 0, autoStatus: "confirmed", autoKind: "card_bill" });
    expect(merge(out.entries, bill({ amount: 0 })).changed).toBe(false);
  });

  it("a card ID survives a display-name change", () => {
    const out = mergeFinanceObservations([], feed(bill({ cardId: "smcc-1", cardName: "old display name" })), config, cards);
    expect(out.entries[0].item).toBe("SMCC Gold");
    expect(out.results[0].status).toBe("applied");
  });
});

describe("finance feed: revisions and manual protection", () => {
  const revised = (overrides: Partial<FinanceObservation> = {}) => bill({
    id: "mail:bill-2", amount: 13000,
    issuedAt: "2026-10-25T09:00:00+09:00", receivedAt: "2026-10-25T09:01:00+09:00", ...overrides,
  });

  it("updates only its unmodified automatic entry and retains the entry ID", () => {
    const first = merge([], bill());
    const original = JSON.stringify(first.entries);
    const out = merge(first.entries, revised());
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ id: first.entries[0].id, amount: 13000, autoSourceId: "mail:bill-2" });
    expect(JSON.stringify(first.entries)).toBe(original);
    expect(merge(out.entries, bill(), revised()).changed).toBe(false);
  });

  it("prefers issuance time to later mail delivery", () => {
    const lateOld = bill({ receivedAt: "2026-10-26T12:00:00+09:00" });
    const out = merge([], lateOld, revised());
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].amount).toBe(13000);
    expect(out.results.map((r) => r.status)).toEqual(["superseded", "applied"]);
    const stale = merge(out.entries, lateOld);
    expect(stale.changed).toBe(false);
    expect(stale.results[0].status).toBe("superseded");
  });

  it("uses receivedAt only when issuedAt is absent", () => {
    const out = merge([], bill({ issuedAt: undefined }));
    expect(out.entries[0].autoIssuedAt).toBe("2026-10-24T09:01:00+09:00");
  });

  it("protects a user edit even though edit forms retain automatic metadata", () => {
    const first = merge([], bill());
    const edited = [{ ...first.entries[0], amount: 12000 }];
    const out = merge(edited, revised());
    expect(out.entries).toBe(edited);
    expect(out.results[0].status).toBe("conflict");
    expect(isUnmodifiedFinanceEntry(edited[0])).toBe(false);
  });

  it("protects an automatic entry manually moved to another month", () => {
    const first = merge([], bill());
    const edited = [{ ...first.entries[0], ym: "2026-09" }];
    const out = merge(edited, revised());
    expect(out.entries).toBe(edited);
    expect(out.entries).toHaveLength(1);
    expect(out.results[0].status).toBe("conflict");
  });

  it("will not update unverifiable legacy provenance", () => {
    const entry = { ...manualBill(), autoSourceId: "mail:bill-1", autoLogicalKey: "bill:smcc-1:2026-10" };
    const out = merge([entry], revised());
    expect(out.changed).toBe(false);
    expect(out.results[0].status).toBe("conflict");
  });

  it("does not choose arbitrarily between inconsistent notices issued at the same instant", () => {
    const out = merge([], bill(), bill({ id: "mail:other", amount: 9000 }));
    expect(out.entries).toEqual([]);
    expect(out.results.map((r) => r.status)).toEqual(["conflict", "conflict"]);
  });

  it("deduplicates equivalent separate emails", () => {
    const out = merge([], bill(), bill({ id: "mail:copy" }));
    expect(out.entries).toHaveLength(1);
    expect(out.results.filter((r) => r.status === "applied")).toHaveLength(1);
    expect(merge(out.entries, bill(), bill({ id: "mail:copy" })).changed).toBe(false);
  });

  it("applies a revised due date inside the same payment cycle", () => {
    const first = merge([], bill());
    const out = merge(first.entries, revised({ dueDate: "2026-11-09" }));
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].autoDueDate).toBe("2026-11-09");
    expect(entryDate(out.entries[0])).toBeUndefined();
  });

  it("retires the automatic aggregate when a matching bank CSV debit is added later", () => {
    const first = merge([], bill());
    const actual = manualBill({ id: "csv-debit", date: "2026-11-10", src: "2026-11-10|-12500|ミツイスミトモ" });
    const input = [...first.entries, actual];
    const out = merge(input, bill());
    expect(input).toHaveLength(2);
    expect(out.changed).toBe(true);
    expect(out.entries).toEqual([actual]);
    expect(out.results[0].status).toBe("matched");
    expect(cardClaimStates(cards, {}, [], out.entries, "2026-10", 10)[0])
      .toMatchObject({ amount: 12500, status: "paid" });
    expect(merge(out.entries, bill()).changed).toBe(false);
  });

  it("retires an unedited auto bill even when later manual debit rows disagree", () => {
    const first = merge([], bill());
    const actual = manualBill({ id: "manual-debit", amount: 13000, date: "2026-11-10" });
    const out = merge([...first.entries, actual], bill());
    expect(out.entries).toEqual([actual]);
    expect(out.results[0].status).toBe("conflict");
    expect(out.changed).toBe(true);
    expect(merge(out.entries, bill()).changed).toBe(false);
  });

  it("compares split manual debits with the statement after removing the automatic total", () => {
    const first = merge([], bill());
    const actual = [manualBill({ id: "debit-a", amount: 5000 }), manualBill({ id: "debit-b", amount: 7500 })];
    const out = merge([...first.entries, ...actual], bill());
    expect(out.entries).toEqual(actual);
    expect(out.results[0].status).toBe("matched");
  });

  it("never retires an automatic bill that the user edited, even when a manual debit exists", () => {
    const first = merge([], bill());
    const modified = { ...first.entries[0], amount: 10000 };
    const actual = manualBill({ id: "csv-debit", date: "2026-11-10" });
    const entries = [modified, actual];
    const out = merge(entries, bill());
    expect(out.entries).toBe(entries);
    expect(out.results[0].status).toBe("conflict");
    expect(out.changed).toBe(false);
  });
});

describe("finance feed: balance snapshots", () => {
  it("stores an explicit asOf and uses the bank snapshot date to assign a cycle", () => {
    const out = merge([], balance());
    expect(out.entries[0]).toMatchObject({ cat: "account", item: "残高", account: "NEOBANK", ym: "2026-10", asOf: "2026-10-25", amount: 100000, autoKind: "balance" });
    expect(merge(out.entries, balance()).changed).toBe(false);
  });

  it("a later received notification cannot overwrite a newer balance snapshot", () => {
    const first = merge([], balance());
    const old = balance({ id: "mail:old-balance", asOf: "2026-10-20", amount: 150000, issuedAt: "2026-10-26T12:00:00+09:00", receivedAt: "2026-10-26T12:01:00+09:00" });
    const out = merge(first.entries, old);
    expect(out.entries).toBe(first.entries);
    expect(out.results[0].status).toBe("superseded");
    expect(merge([], balance(), old).entries[0].asOf).toBe("2026-10-25");
  });

  it("updates an unedited automatic snapshot when the explicit asOf advances", () => {
    const first = merge([], balance({ asOf: "2026-10-24" }));
    const out = merge(first.entries, balance({ id: "mail:new-balance", amount: 90000 }));
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ amount: 90000, asOf: "2026-10-25" });
  });

  it("protects a manual balance even when the incoming snapshot is newer", () => {
    const existing: Entry[] = [{ id: "hand-balance", ym: "2026-10", cat: "account", item: "残高", account: "NEOBANK", amount: 110000, asOf: "2026-10-20" }];
    const out = merge(existing, balance());
    expect(out.entries).toBe(existing);
    expect(out.results[0].status).toBe("conflict");
  });

  it("protects an undated manual month-end balance from a partial-period snapshot", () => {
    const existing: Entry[] = [{ id: "hand-balance", ym: "2026-10", cat: "account", item: "残高", account: "NEOBANK", amount: 110000 }];
    const out = merge(existing, balance());
    expect(out.entries).toBe(existing);
    expect(out.results[0].status).toBe("superseded");
  });

  it("does not create unknown accounts or assume that the mail receipt time is the balance date", () => {
    for (const observation of [balance({ account: "未登録銀行" }), balance({ asOf: undefined }), balance({ asOf: "2026-02-30" })]) {
      const out = merge([], observation);
      expect(out.entries).toEqual([]);
      expect(out.results[0].status).toBe("pending");
    }
  });
});

describe("finance feed: eligibility and lifecycle", () => {
  it("never turns daily purchases, unconfirmed notices, or missing amounts into expenses", () => {
    const notices = [bill({ kind: "notice" }), bill({ status: "unconfirmed" }), bill({ amount: undefined }), bill({ amount: -100 }), bill({ amount: Number.NaN }), bill({ amount: 1.5 }), bill({ currency: "USD" }), bill({ dueDate: undefined }), bill({ cardName: "未登録カード" })];
    for (const observation of notices) {
      const out = merge([], observation);
      expect(out.entries).toEqual([]);
      expect(out.changed).toBe(false);
      expect(out.results[0].status).toBe("pending");
    }
  });

  it("validates explicit dated evidence and rejects ambiguous timestamps", () => {
    for (const observation of [bill({ dueDate: "2026-02-30" }), bill({ receivedAt: "2026-10-25 12:00" }), bill({ issuedAt: "not-a-date" })]) {
      expect(merge([], observation).results[0].status).toBe("pending");
    }
  });

  it("honors closed months and deliberate deletion suppression", () => {
    const first = merge([], bill());
    for (const options of [{ closedMonths: ["2026-10"] }, { suppressed: ["bill:smcc-1:2026-10"] }, { suppressed: [bill().id] }, { suppressed: [first.entries[0].id!] }]) {
      const out = mergeFinanceObservations([], feed(bill()), config, cards, options);
      expect(out.entries).toEqual([]);
      expect(out.results[0].status).toBe("pending");
    }
  });

  it("ignores unsupported or malformed feed envelopes without replacing any entry", () => {
    const entries = [manualBill()];
    for (const raw of [null, { version: 2, observations: {} }, { version: 1, observations: [] }, { version: 1, observations: { bad: null } }]) {
      expect(normalizeFinanceFeed(raw)).toBeNull();
      const out = mergeFinanceObservations(entries, raw, config, cards);
      expect(out.entries).toBe(entries);
      expect(out.changed).toBe(false);
    }
  });

  it("keeps a complete comparison base across JSON persistence", () => {
    const first = merge([], bill());
    const roundTrip: Entry = JSON.parse(JSON.stringify(first.entries[0]));
    expect(roundTrip.autoBase).toEqual(financeEntryBase(roundTrip));
    expect(isUnmodifiedFinanceEntry(roundTrip)).toBe(true);
    expect(merge([roundTrip], bill()).changed).toBe(false);
  });
});

describe("finance feed: integration with payment state and forecast", () => {
  const unrelatedBalance = (asOf?: string): Entry => ({
    id: "unrelated-account-balance", ym: "2026-10", cat: "account", item: "残高", account: "ゆうちょ", amount: 150000, asOf,
  });

  it("a newer balance at another bank does not prove that a confirmed email bill was paid", () => {
    const payment = bill({ dueDate: "2026-10-20" });
    const generated = merge([], payment).entries;
    const rows = [...generated, unrelatedBalance("2026-10-25")];
    expect(cardClaimStates(cards, {}, [], rows, "2026-10", 10)[0])
      .toMatchObject({ amount: 12500, due: "2026-10-20", status: "confirmed" });
    expect(pendingCardClaims(rows, cards, "2026-10", 10)).toBe(12500);
  });

  it("an undated month-end balance also cannot settle an email-only bill", () => {
    const generated = merge([], bill()).entries;
    const rows = [...generated, unrelatedBalance()];
    expect(cardClaimStates(cards, {}, [], rows, "2026-10", 10)[0].status).toBe("confirmed");
    expect(pendingCardClaims(rows, cards, "2026-10", 10)).toBe(12500);
  });

  it("uses the explicit bill due date for upcoming payments instead of the card default", () => {
    const generated = merge([], bill({ dueDate: "2026-11-09" })).entries;
    expect(cardClaimStates(cards, {}, [], generated, "2026-10", 10)[0].due).toBe("2026-11-09");
    expect(upcomingDebits(generated, cards, {}, [], 10, "2026-10", "2026-10-25"))
      .toEqual([expect.objectContaining({ date: "2026-11-09", amount: 12500, status: "confirmed", kind: "card" })]);
  });

  it("a zero confirmed bill suppresses nonzero planned debt instead of reviving a forecast", () => {
    const generated = merge([], bill({ amount: 0 })).entries;
    const debt = { "SMCC Gold": { "2026-10": 6000 } };
    const rows = [...generated, unrelatedBalance("2026-10-25")];
    expect(cardClaimStates(cards, debt, [], rows, "2026-10", 10)).toEqual([]);
    expect(upcomingDebits(rows, cards, debt, [], 10, "2026-10", "2026-10-25")).toEqual([]);
    expect(pendingCardClaims(rows, cards, "2026-10", 10)).toBe(0);
  });

  it("preserves legacy actual-debit evidence when a matching statement arrives later", () => {
    const actualDebit = manualBill({ date: "2026-11-10", src: "2026-11-10|-12500|ミツイスミトモ" });
    const existing = [actualDebit, unrelatedBalance("2026-11-10")];
    const out = merge(existing, bill());
    expect(out.entries).toBe(existing);
    expect(out.results[0].status).toBe("matched");
    expect(cardClaimStates(cards, {}, [], out.entries, "2026-10", 10)[0].status).toBe("paid");
    expect(pendingCardClaims(out.entries, cards, "2026-10", 10)).toBe(0);
  });
});
