import type { Sub } from "./utils";

export type ContractKind = "line" | "device";
export type ContractStatus = "review" | "active" | "ended";
export type RewardStatus = "review" | "pending" | "received";

export interface ContractHistory {
  carrier?: string;
  plan?: string;
  startDate?: string;
  device?: string;
  sourceSheet: string;
  sourceRow: number;
}

// 契約台帳だけでは支出を計上しない。計画への反映先は利用者が選ぶ Sub 1件。
// monthlyAmountLater の適用開始や残債は、二つの月額だけからは推定しない。
export interface Contract {
  id: string;
  kind: ContractKind;
  name: string;
  status: ContractStatus;
  linkedSubId?: string;
  phone?: string;
  contractNumber?: string;
  carrier?: string;
  device?: string;
  purpose?: string;
  plan?: string;
  dataAllowance?: string;
  monthlyAmount?: number;
  optionAmount?: number;
  optionNote?: string;
  callRate?: string;
  startDate?: string;
  endDate?: string;
  monthlyAmountLater?: number;
  totalAmount?: number;
  installments?: number;
  paymentMethod?: string;
  cashbackRate?: number;
  rewardAmount?: number;
  rewardDate?: string;
  rewardStatus?: RewardStatus;
  rewardNote?: string;
  benefitNote?: string;
  note?: string;
  recordedDay180?: string;
  recordedMonth13?: string;
  recordedMonth25?: string;
  history?: ContractHistory[];
  sourceKey?: string;
  sourceSheet?: string;
  sourceRow?: number;
}

export interface SubscriptionImportSource {
  sourceKey: string;
  sourceSheet: string;
  sourceRow: number;
  reviewStatus: "review" | "confirmed";
  statementName?: string;
  platform?: string;
  discount?: string;
  paymentMethod?: string;
  recordedRenewalDate?: string;
}

export interface ImportedSubscription extends Sub {
  contractImport?: SubscriptionImportSource;
}

export interface SubscriptionCandidate {
  id: string;
  sourceKey: string;
  sourceSheet: string;
  sourceRow: number;
  reviewStatus: "review";
  sub: ImportedSubscription;
  statementName?: string;
  platform?: string;
  discount?: string;
  paymentMethod?: string;
}

export type WorkbookSheets = Record<string, unknown[][]>;
export interface ContractWorkbookImport {
  contracts: Contract[];
  subscriptions: SubscriptionCandidate[];
  warnings: string[];
}

const DAY_MS = 86_400_000;
const text = (value: unknown): string | undefined => {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value).trim();
  return result || undefined;
};
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const numberCell = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = text(value)?.normalize("NFKC").replace(/[,¥￥\s]/g, "").replace(/(?:円|pt|ポイント)$/i, "");
  if (!raw || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return undefined;
  const result = Number(raw);
  return Number.isFinite(result) ? result : undefined;
};
const rateCell = (value: unknown): number | undefined => {
  const raw = text(value)?.normalize("NFKC");
  return raw?.endsWith("%") ? numberCell(raw.slice(0, -1)) !== undefined ? numberCell(raw.slice(0, -1))! / 100 : undefined : numberCell(value);
};
const phoneKey = (value?: string) => (value || "").normalize("NFKC").replace(/[\s()-]/g, "");

// 安定した取込ID用。秘匿化・暗号化のためのハッシュではない。
function stableId(prefix: string, value: string): string {
  let a = 2166136261, b = 2246822507;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 3266489909);
  }
  return `${prefix}_${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) return undefined;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return undefined;
  return dt.toISOString().slice(0, 10);
}

/** Excelの1900日付系、ISO文字列、Dateを受け付ける。空欄を日付や0にしない。 */
export function contractDateFromCell(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()) : undefined;
  if (typeof value === "number") {
    const serial = Math.floor(value);
    if (!Number.isFinite(serial) || serial < 1 || serial === 60 || serial > 2958465) return undefined;
    const dt = new Date(Date.UTC(1899, 11, serial < 60 ? 31 : 30) + serial * DAY_MS);
    return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const valueText = text(value);
  if (!valueText) return undefined;
  const match = valueText.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : undefined;
}

export function addContractDays(date: string | null | undefined, days: number): string | undefined {
  const iso = contractDateFromCell(date);
  if (!iso || !Number.isInteger(days)) return undefined;
  const dt = new Date(`${iso}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** EDATE相当。1月31日+1か月は2月末。夏時間や実行環境の時差に依存しない。 */
export function addContractMonths(date: string | null | undefined, months: number): string | undefined {
  const iso = contractDateFromCell(date);
  if (!iso || !Number.isInteger(months)) return undefined;
  const [year, month, day] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDate(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(day, lastDay));
}

// 経過期間の目安。解約可否・返却期限・特典条件の達成を判定するものではない。
export function contractMilestones(contract: Contract): { day180?: string; month13?: string; month25?: string } {
  if (contract.kind === "line") return { day180: addContractDays(contract.startDate, 180) || contractDateFromCell(contract.recordedDay180) };
  return {
    month13: addContractMonths(contract.startDate, 13) || contractDateFromCell(contract.recordedMonth13),
    month25: addContractMonths(contract.startDate, 25) || contractDateFromCell(contract.recordedMonth25),
  };
}

function serviceKey(name: string): string {
  const value = normalized(name);
  // 同じサービスの表記・プラン名の差だけを吸収する。ブランド名だけでは統合しない。
  if (/^icloud(?:\d+(?:gb|tb))?$/.test(value)) return "icloud";
  if (value === "amazonprimestudent") return "amazonprime";
  if (value === "jalwellnesstravel") return "jalwellness";
  if (value === "newspickspremium") return "newspicks";
  if (/^jsports(?:野球パック)?(?:u25)?$/.test(value)) return "jsports";
  return value;
}

export function findExistingContract(existing: Contract[], incoming: Contract): Contract | undefined {
  return existing.find((item) => {
    if (item.id === incoming.id || (item.sourceKey && item.sourceKey === incoming.sourceKey)) return true;
    if (item.kind !== incoming.kind) return false;
    if (item.kind === "line") return !!phoneKey(item.phone) && phoneKey(item.phone) === phoneKey(incoming.phone);
    return !!phoneKey(item.contractNumber) && phoneKey(item.contractNumber) === phoneKey(incoming.contractNumber);
  });
}

export function mergeContractImports(existing: Contract[], incoming: Contract[]): { contracts: Contract[]; added: number; skipped: number } {
  const contracts = [...existing];
  let added = 0, skipped = 0;
  for (const item of incoming) {
    if (findExistingContract(contracts, item)) { skipped++; continue; }
    contracts.push(item);
    added++;
  }
  return { contracts, added, skipped };
}

/** 保存データ/バックアップの境界。未知の追加フィールドは保持し、表示で使う型だけ整える。 */
export function normalizeContracts(raw: unknown): Contract[] {
  if (!Array.isArray(raw)) return [];
  const result: Contract[] = [];
  const ids = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim() || typeof item.name !== "string" || !item.name.trim() || (item.kind !== "line" && item.kind !== "device")) continue;
    const id = item.id.trim();
    if (ids.has(id)) continue;
    ids.add(id);
    const safe: Record<string, unknown> = { ...item, id, name: item.name.trim(), kind: item.kind, status: item.status === "active" || item.status === "ended" ? item.status : "review" };
    for (const key of ["linkedSubId", "phone", "contractNumber", "carrier", "device", "purpose", "plan", "dataAllowance", "optionNote", "callRate", "paymentMethod", "rewardNote", "benefitNote", "note", "sourceKey", "sourceSheet"]) safe[key] = text(item[key]);
    for (const key of ["monthlyAmount", "optionAmount", "monthlyAmountLater", "totalAmount", "cashbackRate", "rewardAmount"]) safe[key] = numberCell(item[key]);
    for (const key of ["startDate", "endDate", "rewardDate", "recordedDay180", "recordedMonth13", "recordedMonth25"]) safe[key] = contractDateFromCell(item[key]);
    for (const key of ["installments", "sourceRow"]) {
      const number = numberCell(item[key]);
      safe[key] = number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined;
    }
    safe.rewardStatus = item.rewardStatus === "pending" || item.rewardStatus === "received" ? item.rewardStatus : item.rewardStatus === "review" || safe.rewardAmount !== undefined || safe.rewardDate ? "review" : undefined;
    safe.history = Array.isArray(item.history) ? item.history.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const history = entry as Record<string, unknown>;
      const sourceSheet = text(history.sourceSheet), sourceRow = numberCell(history.sourceRow);
      if (!sourceSheet || sourceRow === undefined || !Number.isInteger(sourceRow) || sourceRow < 1) return [];
      return [{ ...history, carrier: text(history.carrier), plan: text(history.plan), startDate: contractDateFromCell(history.startDate), device: text(history.device), sourceSheet, sourceRow }];
    }) : undefined;
    result.push(safe as unknown as Contract);
  }
  return result;
}

export function unlinkMissingSubscriptions(contracts: Contract[], subs: Sub[]): Contract[] {
  const ids = new Set(subs.map((sub) => sub.id));
  if (!contracts.some((contract) => contract.linkedSubId && !ids.has(contract.linkedSubId))) return contracts;
  return contracts.map((contract) => contract.linkedSubId && !ids.has(contract.linkedSubId) ? { ...contract, linkedSubId: undefined } : contract);
}

export interface SubscriptionImportProposal {
  candidate: SubscriptionCandidate;
  action: "new" | "match" | "ambiguous";
  matches: Sub[];
}

export function planSubscriptionImport(existing: Sub[], candidates: SubscriptionCandidate[]): SubscriptionImportProposal[] {
  return candidates.map((candidate) => {
    const matches = existing.filter((sub) => sub.id === candidate.sub.id
      || (sub as ImportedSubscription).contractImport?.sourceKey === candidate.sourceKey
      || serviceKey(sub.name) === serviceKey(candidate.sub.name));
    return { candidate, action: matches.length > 1 ? "ambiguous" : matches.length ? "match" : "new", matches };
  });
}

/** 不明額を固定費0円として登録しない。明示された0円は有効。 */
export function isImportableSubscriptionAmount(amount: Sub["amount"]): boolean {
  const value = numberCell(amount);
  return value !== undefined && value >= 0;
}

/** 選択した新規サービスだけ追加。既存の金額・更新日・終了日・カードは一切上書きしない。 */
export function mergeSubscriptionImports(existing: Sub[], candidates: SubscriptionCandidate[], selectedIds: string[]): { subs: Sub[]; added: number; skipped: number } {
  const subs = [...existing];
  const selected = new Set(selectedIds);
  let added = 0, skipped = 0;
  for (const candidate of candidates) {
    if (!selected.has(candidate.id)) continue;
    if (!isImportableSubscriptionAmount(candidate.sub.amount)) { skipped++; continue; }
    if (planSubscriptionImport(subs, [candidate])[0].action !== "new") { skipped++; continue; }
    // 入力表記が「1,200円」などでも、定期費の計算へは検証済み数値を渡す。
    subs.push({ ...candidate.sub, amount: numberCell(candidate.sub.amount)! });
    added++;
  }
  return { subs, added, skipped };
}

/** 読み取り済みセル配列を台帳候補へ変換する純粋関数。登録・連携は呼出側の明示操作。 */
export function parseContractWorkbook(sheets: WorkbookSheets): ContractWorkbookImport {
  const contracts: Contract[] = [];
  const subscriptions: SubscriptionCandidate[] = [];
  const warnings: string[] = [];
  const currentName = "202604";
  const current = Array.isArray(sheets[currentName]) ? sheets[currentName] : [];
  if (!current.length) warnings.push("回線シート「202604」がありません。過去の回線一覧は現契約として取り込みません。");

  const history = new Map<string, ContractHistory[]>();
  const oldName = "Sheet1 (2)";
  for (const [index, row] of (sheets[oldName] || []).entries()) {
    if (!Array.isArray(row) || index < 2) continue;
    const phone = text(row[2]), carrier = text(row[3]);
    if (!phone || !carrier) continue;
    const entry: ContractHistory = { carrier, plan: text(row[4]), startDate: contractDateFromCell(row[8]), device: text(row[0]), sourceSheet: oldName, sourceRow: index + 1 };
    const key = phoneKey(phone), prior = history.get(key) || [];
    if (!prior.some((item) => item.carrier === entry.carrier && item.plan === entry.plan && item.startDate === entry.startDate)) prior.push(entry);
    history.set(key, prior);
  }

  current.forEach((row, index) => {
    if (!Array.isArray(row) || index < 2) return;
    const carrier = text(row[3]);
    if (!carrier || carrier === "キャリア") return;
    const phone = text(row[2]);
    const sourceKey = `line:${phone ? phoneKey(phone) : `${currentName}:${index + 1}`}`;
    const rewardAmount = numberCell(row[11]), rewardDate = contractDateFromCell(row[12]);
    const optionAmount = numberCell(row[7]);
    const startDate = contractDateFromCell(row[9]);
    const plan = text(row[4]);
    const prior = (history.get(phoneKey(phone)) || []).filter((item) => item.carrier !== carrier || item.plan !== plan || item.startDate !== startDate);
    contracts.push({
      id: stableId("contract", sourceKey), kind: "line", name: [carrier, text(row[1])].filter(Boolean).join(" "), status: "review",
      phone, carrier, device: text(row[0]), purpose: text(row[1]), plan, dataAllowance: text(row[5]),
      monthlyAmount: numberCell(row[6]), optionAmount, optionNote: optionAmount === undefined ? text(row[7]) : undefined,
      callRate: text(row[8]), startDate, recordedDay180: contractDateFromCell(row[10]),
      rewardAmount, rewardDate, rewardStatus: rewardAmount !== undefined || rewardDate ? "review" : undefined,
      rewardNote: rewardAmount === undefined ? text(row[11]) : undefined,
      paymentMethod: text(row[13]), cashbackRate: rateCell(row[14]), benefitNote: text(row[15]),
      history: prior.length ? prior : undefined, sourceKey, sourceSheet: currentName, sourceRow: index + 1,
    });
    if (typeof row[2] === "number") warnings.push(`${currentName} ${index + 1}行: 電話番号が数値です。先頭の0が欠けていないか確認してください。`);
  });

  const deviceName = Object.keys(sheets).find((name) => name.toLowerCase() === "device");
  (deviceName ? sheets[deviceName] : []).forEach((row, index) => {
    if (!Array.isArray(row) || index < 2) return;
    const device = text(row[4]);
    if (!device || device === "機種") return;
    const carrier = text(row[3]), contractNumber = text(row[2]), note = text(row[13]);
    const startDate = contractDateFromCell(row[8]);
    // 行番号は並べ替えで変わるため識別子にはしない。番号のない同一条件の複数端末は下で保留する。
    const sourceKey = `device:${contractNumber ? phoneKey(contractNumber) : `${normalized(carrier || "")}:${normalized(device)}:${startDate || "unknown"}`}`;
    const installmentMatch = note?.normalize("NFKC").match(/(\d+)\s*回払い/);
    contracts.push({
      id: stableId("contract", sourceKey), kind: "device", name: device, status: "review", contractNumber, carrier, device,
      monthlyAmount: numberCell(row[5]), monthlyAmountLater: numberCell(row[6]), totalAmount: numberCell(row[7]),
      startDate, recordedMonth13: contractDateFromCell(row[9]), recordedMonth25: contractDateFromCell(row[10]),
      installments: installmentMatch ? Number(installmentMatch[1]) : undefined, paymentMethod: text(row[11]), note,
      sourceKey, sourceSheet: deviceName!, sourceRow: index + 1,
    });
  });

  const unnumberedDevices = new Map<string, Contract[]>();
  for (const contract of contracts) {
    if (contract.kind !== "device" || contract.contractNumber || !contract.sourceKey) continue;
    const group = unnumberedDevices.get(contract.sourceKey) || [];
    group.push(contract);
    unnumberedDevices.set(contract.sourceKey, group);
  }
  const ambiguousDeviceKeys = new Set<string>();
  for (const [key, group] of unnumberedDevices) {
    if (group.length < 2) continue;
    ambiguousDeviceKeys.add(key);
    warnings.push(`${group[0].device}: キャリア・機種・開始日が同じ端末が${group.length}件あり、区別できません。この端末は取り込んでいません。契約番号を記入してから再度取り込んでください。`);
  }

  const subscriptionName = Object.keys(sheets).find((name) => name.toLowerCase() === "subscription");
  let cycle: Sub["cycle"] | undefined;
  (subscriptionName ? sheets[subscriptionName] : []).forEach((row, index) => {
    if (!Array.isArray(row)) return;
    const marker = text(row[1]);
    if (marker === "年間") cycle = "yearly";
    if (marker === "月間") cycle = "monthly";
    const name = text(row[2]);
    if (!cycle || !name || name === "項目") return;
    const sourceKey = `subscription:${serviceKey(name)}`;
    const discount = text(row[3]), statementName = text(row[7]), platform = text(row[8]), paymentMethod = text(row[9]);
    const sourceRenewalDate = contractDateFromCell(row[5]);
    const day = numberCell(row[4]);
    const renewalDay = cycle === "monthly" && day !== undefined && Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
    const renewal = cycle === "yearly" || renewalDay !== undefined ? sourceRenewalDate : undefined;
    const source: SubscriptionImportSource = {
      sourceKey, sourceSheet: subscriptionName!, sourceRow: index + 1, reviewStatus: "review",
      discount, statementName, platform, paymentMethod, recordedRenewalDate: sourceRenewalDate,
    };
    const note = [discount && `適用区分：${discount}`, statementName && `請求名：${statementName}`, platform && `プラットフォーム：${platform}`, paymentMethod && `原票の支払い：${paymentMethod}`].filter(Boolean).join("\n");
    subscriptions.push({
      id: stableId("candidate", `${sourceKey}:${index + 1}`), sourceKey, sourceSheet: subscriptionName!, sourceRow: index + 1, reviewStatus: "review",
      discount, statementName, platform, paymentMethod,
      sub: {
        id: stableId("imported_sub", sourceKey), name, amount: numberCell(row[6]) ?? "", cycle, category: "サブスク",
        startDate: cycle === "yearly" ? contractDateFromCell(row[4]) : undefined,
        renewal, renewalDay, note: note || undefined, contractImport: source,
      },
    });
    if (cycle === "monthly" && sourceRenewalDate && renewalDay === undefined) warnings.push(`${name}: 更新日が空欄のため、原票の次回日を支払予定には反映していません。`);
  });

  if (!contracts.length && !subscriptions.length) warnings.push("対象の契約・サブスクが見つかりませんでした。シート名と見出しを確認してください。");
  const identifiedContracts = contracts.filter((contract) => !contract.sourceKey || !ambiguousDeviceKeys.has(contract.sourceKey));
  return { contracts: mergeContractImports([], identifiedContracts).contracts, subscriptions, warnings };
}
