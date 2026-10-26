import { acctRole, cycleEndDate, cycleYm, type Card, type Config, type Entry } from "./utils";
import type { BankSnapshot } from './bank-feed';

/** Read-only observations supplied by the server; they are not transaction entries. */
export interface FinanceObservation {
  id: string;
  kind: "card_bill" | "balance" | "notice";
  cardId?: string;
  cardName?: string;
  account?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  asOf?: string;
  issuedAt?: string;
  receivedAt: string;
  sourceUrl?: string;
  sender?: string;
  subject?: string;
  status: "confirmed" | "unconfirmed";
  note?: string;
}

export interface FinanceFeed {
  version: 1;
  checkedAt?: string;
  observations: Record<string, FinanceObservation>;
  sources?: unknown[];
  bankSnapshot?: BankSnapshot;
}

export type FinanceResultStatus = "applied" | "matched" | "conflict" | "pending" | "superseded";
export interface FinanceObservationResult {
  observation: FinanceObservation;
  status: FinanceResultStatus;
  message: string;
}
export interface FinanceMergeOptions {
  closedMonths?: readonly string[];
  /** Observation IDs, automatic logical keys, or automatic entry IDs intentionally removed by the user. */
  suppressed?: readonly string[];
}
export interface FinanceMergeResult {
  entries: Entry[];
  results: FinanceObservationResult[];
  changed: boolean;
}

type Candidate = {
  observation: FinanceObservation;
  resultIndex: number;
  logicalKey: string;
  ym: string;
  item: string;
  account: string;
  kind: "card_bill" | "balance";
  amount: number;
  effectiveAt: string;
  timestamp: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** No permissive date parsing: February 30 and ambiguous local timestamps must not reach the ledger. */
const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const timestamp = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (!isDate(value.slice(0, 10))) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** An invalid envelope is ignored rather than mistaken for an empty, authoritative ledger. */
export function normalizeFinanceFeed(value: unknown): FinanceFeed | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.observations)) return null;
  if (Object.values(value.observations).some((observation) => !isRecord(observation))) return null;
  return value as unknown as FinanceFeed;
}

const BASE_FIELDS = ["ym", "cat", "item", "account", "amount", "date", "src", "asOf", "autoKind", "autoStatus", "autoDueDate"] as const;

/** Store financial values, not just provenance: edit forms preserve provenance when a user edits a row. */
export function financeEntryBase(entry: Entry): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const field of BASE_FIELDS) base[field] = entry[field] ?? "";
  return base;
}

export function isUnmodifiedFinanceEntry(entry: Entry): boolean {
  if (!entry.autoSourceId || !entry.autoLogicalKey || !isRecord(entry.autoBase)) return false;
  const current = financeEntryBase(entry);
  return BASE_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(entry.autoBase, field)
    && entry.autoBase![field] === current[field]);
}

const sameFinancialObservation = (a: Candidate, b: Candidate): boolean =>
  a.amount === b.amount && (a.kind === "card_bill"
    ? a.observation.dueDate === b.observation.dueDate
    : a.observation.asOf === b.observation.asOf);

/** Balance dates take priority over delivery/issuance order; delayed mail cannot rewind a balance. */
const compareCandidates = (a: Candidate, b: Candidate): number => {
  if (a.kind === "balance" && b.kind === "balance") {
    const dates = a.observation.asOf!.localeCompare(b.observation.asOf!);
    if (dates !== 0) return dates;
  }
  return a.timestamp - b.timestamp;
};

const automaticEntryId = (key: string): string => `finance:${encodeURIComponent(key)}`;

function makeEntry(candidate: Candidate, existing?: Entry): Entry {
  const observation = candidate.observation;
  const entry: Entry = {
    ...(existing || {}),
    id: existing?.id || automaticEntryId(candidate.logicalKey),
    ym: candidate.ym,
    cat: candidate.kind === "card_bill" ? "card" : "account",
    item: candidate.item,
    account: candidate.account,
    amount: candidate.amount,
    // `date` / parsed `src` means an actual debit in the legacy UI. A scheduled bill is not paid.
    date: undefined,
    src: undefined,
    asOf: candidate.kind === "balance" ? observation.asOf : undefined,
    autoKind: candidate.kind,
    autoStatus: "confirmed",
    autoDueDate: candidate.kind === "card_bill" ? observation.dueDate : undefined,
    autoSourceId: observation.id,
    autoLogicalKey: candidate.logicalKey,
    autoIssuedAt: candidate.effectiveAt,
    autoReceivedAt: observation.receivedAt,
  };
  entry.autoBase = financeEntryBase(entry);
  return entry;
}

/**
 * Conservatively project confirmed facts into the existing payment-cycle ledger.
 * Unknown notices never become zeroes; manual rows are matched or reported, never overwritten.
 * This function has no storage/network side effects, does not mutate its inputs, and is replay-safe.
 */
export function mergeFinanceObservations(
  entries: Entry[],
  rawFeed: FinanceFeed | null | undefined | unknown,
  config: Config,
  cards: readonly Card[],
  options: FinanceMergeOptions = {},
): FinanceMergeResult {
  const feed = normalizeFinanceFeed(rawFeed);
  if (!feed) return { entries, results: [], changed: false };
  const results: FinanceObservationResult[] = [];
  const candidates = new Map<string, Candidate[]>();
  const closed = new Set(options.closedMonths || []);
  const suppressed = new Set(options.suppressed || []);
  const cutoff = config.cycleCutoffDay || 0;
  let nextEntries = entries;
  const result = (candidate: Candidate, status: FinanceResultStatus, message: string) => {
    results[candidate.resultIndex] = { observation: candidate.observation, status, message };
  };

  for (const observation of Object.values(feed.observations)) {
    const resultIndex = results.length;
    const pending = (message: string) => {
      results.push({ observation, status: "pending", message });
    };
    if (typeof observation.id !== "string" || !observation.id.trim()) { pending("通知を識別できないため保留しました。"); continue; }
    if (suppressed.has(observation.id)) { pending("利用者が反映しないと設定した通知です。"); continue; }
    if (observation.kind === "notice") { pending("利用速報や金額のない通知は、確定請求・残高には計上しません。"); continue; }
    if (observation.kind !== "card_bill" && observation.kind !== "balance") { pending("未対応の通知形式です。"); continue; }
    if (observation.status !== "confirmed") { pending("確定していないため、記録への反映を保留しました。"); continue; }
    if (typeof observation.amount !== "number" || !Number.isSafeInteger(observation.amount) || observation.amount < 0) {
      pending("確定した円単位の金額を確認できないため保留しました。"); continue;
    }
    if (observation.currency && observation.currency !== "JPY") { pending("日本円以外の金額は自動反映できません。"); continue; }
    const receivedTime = timestamp(observation.receivedAt);
    const issuedTime = observation.issuedAt === undefined ? receivedTime : timestamp(observation.issuedAt);
    if (receivedTime === null || issuedTime === null) { pending("通知の発行・受信日時を確認できないため保留しました。"); continue; }
    const effectiveAt = observation.issuedAt || observation.receivedAt;
    let ym: string, logicalKey: string, item: string, account = "";
    if (observation.kind === "card_bill") {
      if (!isDate(observation.dueDate)) { pending("引落予定日が不明なため、請求月度を確定できません。"); continue; }
      const matches = observation.cardId
        ? cards.filter((card) => card.id === observation.cardId)
        : cards.filter((card) => card.name === observation.cardName);
      if (matches.length !== 1 || !matches[0].id || cards.filter((card) => card.name === matches[0].name).length !== 1) {
        pending("登録済みのカードを一意に特定できないため保留しました。"); continue;
      }
      const card = matches[0];
      item = card.name;
      ym = cycleYm(observation.dueDate, cutoff);
      logicalKey = `bill:${card.id}:${ym}`;
    } else {
      if (!isDate(observation.asOf)) { pending("残高の基準日が明示されていないため保留しました。"); continue; }
      if (!observation.account || !(config.accounts || []).includes(observation.account)) { pending("未登録の口座のため保留しました。"); continue; }
      account = observation.account;
      item = "残高";
      ym = cycleYm(observation.asOf, cutoff);
      logicalKey = `balance:${account}:${ym}`;
    }
    if (closed.has(ym)) { pending("締め済みの月度のため、自動変更せず保留しました。"); continue; }
    if (suppressed.has(logicalKey) || suppressed.has(automaticEntryId(logicalKey))) {
      pending("利用者が削除・除外した自動記録のため、再作成しません。"); continue;
    }
    const candidate: Candidate = { observation, resultIndex, logicalKey, ym, item, account, kind: observation.kind, amount: observation.amount, effectiveAt, timestamp: issuedTime };
    results.push({ observation, status: "pending", message: "照合待ちです。" });
    const group = candidates.get(logicalKey) || [];
    group.push(candidate);
    candidates.set(logicalKey, group);
  }

  // Stable target order produces the same automatic IDs and row order on different devices.
  for (const [, group] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    group.sort((a, b) => compareCandidates(b, a) || b.observation.id.localeCompare(a.observation.id));
    const candidate = group[0];
    const sameTime = group.filter((other) => compareCandidates(candidate, other) === 0);
    const ambiguous = sameTime.some((other) => !sameFinancialObservation(candidate, other));
    for (const other of group.slice(1)) result(other, "superseded", "同じ対象に、より新しい通知または同内容の通知があります。");
    if (ambiguous) {
      for (const other of sameTime) result(other, "conflict", "同じ時点の通知で金額・日付が異なるため、確認が必要です。");
      continue;
    }

    const linked = nextEntries.filter((entry) => entry.autoLogicalKey === candidate.logicalKey || entry.autoSourceId === candidate.observation.id);
    let target = nextEntries.filter((entry) => entry.ym === candidate.ym && (candidate.kind === "card_bill"
      ? entry.cat === "card" && entry.item === candidate.item
      : entry.cat === "account" && acctRole(entry.item) === "bal" && entry.account === candidate.account));

    // An edited automatic row may have moved to a different month/card; still protect it by provenance.
    if (linked.some((entry) => !isUnmodifiedFinanceEntry(entry))) {
      result(candidate, "conflict", "自動記録が手動で変更されているため、上書きせず保留しました。"); continue;
    }
    if (linked.length > 1 || linked.some((entry) => !target.includes(entry))) {
      result(candidate, "conflict", "対応する自動記録が複数あるか、別の対象に移動しているため保留しました。"); continue;
    }

    // A bank CSV or a manually entered actual debit can arrive after an automatic statement.
    // Keep those authoritative rows and retire our unedited aggregate BEFORE comparing totals;
    // otherwise the same payment is counted once as a statement and again as the actual debit.
    const manualCardRows = candidate.kind === "card_bill"
      ? target.filter((entry) => !entry.autoSourceId && !entry.autoLogicalKey)
      : [];
    if (linked.length === 1 && manualCardRows.length > 0) {
      const retired = linked[0]; // Modification protection above applies before any retirement.
      nextEntries = nextEntries.filter((entry) => entry !== retired);
      target = target.filter((entry) => entry !== retired);
      if (target.some((entry) => !Number.isSafeInteger(entry.amount))) {
        result(candidate, "conflict", "自動の請求合計を外しましたが、既存記録の金額を正しく照合できません。");
        continue;
      }
      const manualTotal = target.reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
      result(candidate, manualTotal === candidate.amount ? "matched" : "conflict", manualTotal === candidate.amount
        ? "手入力・明細の金額と一致したため、自動の請求合計を外して二重計上を解消しました。"
        : "自動の請求合計を外して既存の手入力・明細を残しました。通知の金額と異なるため確認が必要です。");
      continue;
    }

    if (!target.length) {
      const added = makeEntry(candidate);
      if (nextEntries.some((entry) => entry.id === added.id)) {
        result(candidate, "conflict", "既存記録と識別子が重なるため保留しました。"); continue;
      }
      nextEntries = [...nextEntries, added];
      result(candidate, "applied", candidate.kind === "card_bill" ? "確定請求を追加しました。" : "基準日付きの残高を追加しました。");
      continue;
    }

    if (candidate.kind === "balance") {
      const newestKnownDate = target.map((entry) => entry.asOf || cycleEndDate(entry.ym, cutoff)).sort().pop()!;
      if (candidate.observation.asOf! < newestKnownDate) {
        result(candidate, "superseded", "既存残高より古い時点のため、残高を巻き戻しません。"); continue;
      }
    }

    const managed = linked.length === 1 && target.length === 1 ? linked[0] : null;
    if (managed) {
      const oldTime = timestamp(managed.autoIssuedAt) ?? timestamp(managed.autoReceivedAt);
      if (oldTime === null) { result(candidate, "conflict", "既存の自動記録の確認日時が不明なため保留しました。"); continue; }
      const dateAdvanced = candidate.kind === "balance" && Boolean(managed.asOf && candidate.observation.asOf! > managed.asOf);
      if (!dateAdvanced && candidate.timestamp < oldTime) {
        result(candidate, "superseded", "既存の自動記録より古い通知のため変更しません。"); continue;
      }
      const sameValues = managed.amount === candidate.amount
        && (candidate.kind === "card_bill"
          ? managed.autoDueDate === candidate.observation.dueDate
          : managed.asOf === candidate.observation.asOf);
      if (!dateAdvanced && candidate.timestamp === oldTime) {
        result(candidate, sameValues ? "matched" : "conflict", sameValues
          ? "同じ確定内容を反映済みです。"
          : "既存記録と同じ時点の通知で内容が異なるため、確認が必要です。");
        continue;
      }
      const updated = makeEntry(candidate, managed);
      nextEntries = nextEntries.map((entry) => entry === managed ? updated : entry);
      result(candidate, "applied", sameValues ? "金額は一致し、最新の確認情報を更新しました。" : "手動変更のない自動記録を最新の確定内容へ更新しました。");
      continue;
    }

    // Existing manual/CSV rows are authoritative. A statement is compared with the whole card-cycle sum.
    if (target.some((entry) => !Number.isSafeInteger(entry.amount))) {
      result(candidate, "conflict", "既存記録の金額を正しく照合できないため保留しました。"); continue;
    }
    if (candidate.kind === "balance" && target.length !== 1) {
      result(candidate, "conflict", "同じ口座・月度の残高が複数あるため、確認が必要です。"); continue;
    }
    const existingAmount = candidate.kind === "card_bill"
      ? target.reduce((sum, entry) => sum + Math.abs(entry.amount), 0)
      : target[0].amount;
    result(candidate, existingAmount === candidate.amount ? "matched" : "conflict", existingAmount === candidate.amount
      ? "既存の記録と金額が一致しました。二重に追加しません。"
      : "既存の手入力・取込記録と金額が異なります。上書きせず確認を待ちます。");
  }

  return { entries: nextEntries, results, changed: nextEntries !== entries };
}
