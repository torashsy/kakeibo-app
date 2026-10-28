import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ACCENT, INK, LINE, MUTED, RED } from "../theme.js";
import { styles } from "../styles.js";
import { evalAmount, subActiveForMonth, subMonthly, uid, yen } from "../utils";
import { contractMilestones, findExistingContract, isImportableSubscriptionAmount, mergeContractImports, mergeSubscriptionImports, parseContractWorkbook, planSubscriptionImport } from "../contracts";
import { readContractWorkbook } from "../contract-workbook";

const STATUS = { review: "要確認", active: "利用中", ended: "終了" };
const REWARD_STATUS = { review: "要確認", pending: "付与待ち", received: "受取済み" };
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateDiff = (date, today = localDate()) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
};
const masked = (number) => number ? `•••• ${String(number).slice(-4)}` : "番号未登録";
const amountText = (amount) => { const parsed = evalAmount(amount); return parsed == null ? "未確認" : yen(parsed); };
const displayName = (c) => c.name || c.device || c.carrier || (c.kind === "device" ? "端末" : "回線");
const statusColor = (status) => status === "active" ? ACCENT : status === "ended" ? MUTED : RED;
const dateText = (date) => date ? date.replaceAll("-", "/") : "未登録";
const normalizeName = (name) => String(name || "").normalize("NFKC").toLowerCase().replace(/[\s・･ー−-]/g, "");
const s = {
  body: { color: INK, minWidth: 0 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  muted: { color: MUTED, fontSize: 12, lineHeight: 1.65 },
  smallButton: { border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", background: "var(--card-bg)", color: INK, fontFamily: "inherit", fontSize: 12, cursor: "pointer" },
  cardButton: { width: "100%", display: "block", textAlign: "left", background: "var(--card-bg)", border: `1px solid ${LINE}`, borderRadius: 13, padding: "14px", marginBottom: 9, fontFamily: "inherit", cursor: "pointer", color: INK, boxSizing: "border-box" },
  divider: { border: "none", borderTop: `1px solid ${LINE}`, margin: "15px 0" },
  meta: { display: "flex", flexWrap: "wrap", gap: "5px 7px", marginTop: 8 },
  fact: { display: "grid", gridTemplateColumns: "108px minmax(0,1fr)", gap: 10, padding: "7px 0", fontSize: 13, lineHeight: 1.6 },
  section: { borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 14 },
  groupTitle: { fontSize: 13, fontWeight: 600, margin: "0 0 8px", color: INK },
  notice: { background: "var(--group-bg)", padding: "10px 12px", borderRadius: 10, fontSize: 12, color: MUTED, lineHeight: 1.6 },
  error: { color: RED, background: "var(--expense-soft)", borderRadius: 10, padding: "10px 12px", fontSize: 12, lineHeight: 1.6, margin: "10px 0" },
  input: { ...styles.textInput, minWidth: 0 },
  label: { ...styles.fieldLabel, marginTop: 13 },
  check: { display: "flex", alignItems: "flex-start", gap: 9, color: INK, fontSize: 12.5, lineHeight: 1.6, cursor: "pointer", marginTop: 12 },
  checkInput: { accentColor: "var(--accent)", width: 17, height: 17, marginTop: 2, flexShrink: 0 },
};

function Tag({ children, color = MUTED }) {
  return <span style={{ fontSize: 10.5, color, border: `1px solid ${LINE}`, borderRadius: 5, padding: "2px 6px", lineHeight: 1.5 }}>{children}</span>;
}

function Field({ label, value, onChange, type = "text", placeholder = "", inputMode, disabled = false, children }) {
  const id = useId();
  return <div style={{ minWidth: 0 }}>
    <label htmlFor={id} style={s.label}>{label}</label>
    {children ? <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={s.input} disabled={disabled}>{children}</select>
      : <input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} disabled={disabled} style={type === "date" ? styles.dateInput : s.input} />}
  </div>;
}

function DateField({ label, value, onChange }) {
  return <div style={{ minWidth: 0 }}>
    <Field label={label} value={value} onChange={onChange} type="date" />
    {value && <button type="button" style={{ ...styles.chipGhost, margin: "5px 2px 0" }} onClick={() => onChange("")}>日付をクリア</button>}
  </div>;
}

function Dialog({ title, onClose, children }) {
  const panel = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = Array.from(panel.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || []).filter((node) => node.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div style={styles.sheetBackdrop} onClick={onClose}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ ...styles.sheet, outline: "none" }} onClick={(e) => e.stopPropagation()}>
      <div style={styles.sheetHandle} />
      <div style={{ ...s.row, marginBottom: 10 }}><h2 id={titleId} style={{ ...styles.sheetTitle, margin: 0 }}>{title}</h2><button type="button" onClick={onClose} aria-label="閉じる" style={{ ...s.smallButton, fontSize: 18, padding: "4px 10px" }}>×</button></div>
      {children}
    </div>
  </div>;
}

function Fact({ label, value }) {
  if (value == null || value === "") return null;
  return <div style={s.fact}><span style={{ color: MUTED }}>{label}</span><span style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{value}</span></div>;
}

function ContractEditor({ contract, existingContracts, linkedSub, cards, onSave, onClose }) {
  const [edit, setEdit] = useState(() => ({ ...contract, cashbackRate: contract.cashbackRate == null ? "" : String(contract.cashbackRate * 100) }));
  const [syncFee, setSyncFee] = useState(false);
  const [linkedAmount, setLinkedAmount] = useState(linkedSub?.cycle === "monthly" ? String(linkedSub.amount ?? "") : "");
  const [error, setError] = useState("");
  const set = (key, value) => setEdit((old) => ({ ...old, [key]: value }));
  const isDevice = edit.kind === "device";
  const numericKeys = ["monthlyAmount", "optionAmount", "monthlyAmountLater", "totalAmount", "installments", "rewardAmount", "cashbackRate"];
  const submit = (event) => {
    event.preventDefault();
    if (!String(edit.name || "").trim()) { setError("契約名を入力してください。"); return; }
    if (edit.startDate && edit.endDate && edit.endDate < edit.startDate) { setError("終了日は開始日以降にしてください。"); return; }
    const next = { ...edit, id: edit.id || uid(), name: edit.name.trim() };
    if (findExistingContract(existingContracts.filter((item) => item.id !== next.id), next)) { setError("同じ番号の契約が登録されています。既存の契約を編集してください。"); return; }
    for (const key of numericKeys) {
      if (edit[key] == null || String(edit[key]).trim() === "") { delete next[key]; continue; }
      const number = evalAmount(edit[key]);
      if (number == null || number < 0 || (key === "cashbackRate" && number > 100) || (key === "installments" && (!Number.isInteger(number) || number === 0))) { setError("金額・回数・還元率を確認してください。空欄は未確認のまま保存できます。"); return; }
      next[key] = key === "cashbackRate" ? number / 100 : Math.round(number);
    }
    const confirmedFee = isDevice ? evalAmount(linkedAmount) : next.monthlyAmount == null ? null : next.monthlyAmount + (next.optionAmount || 0);
    if (syncFee && (confirmedFee == null || confirmedFee < 0)) { setError("定期費に反映する月額を入力してください。"); return; }
    if (syncFee && next.status === "ended" && !next.endDate) { setError("定期費を終了する日付を入力してください。"); return; }
    onSave(next, syncFee, confirmedFee);
  };
  return <Dialog title={contract.id ? "契約を編集" : `${isDevice ? "端末" : "回線"}を追加`} onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="契約名" value={edit.name} onChange={(v) => set("name", v)} placeholder={isDevice ? "端末名など" : "メイン回線など"} />
      <Field label="状況" value={edit.status || "review"} onChange={(v) => set("status", v)}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Field>
      <Field label="契約先・キャリア" value={edit.carrier} onChange={(v) => set("carrier", v)} />
      <Field label={isDevice ? "契約機種番号" : "電話番号"} value={edit[isDevice ? "contractNumber" : "phone"]} onChange={(v) => set(isDevice ? "contractNumber" : "phone", v)} inputMode="tel" />
      <Field label={isDevice ? "機種" : "利用端末"} value={edit.device} onChange={(v) => set("device", v)} />
      {!isDevice && <><Field label="用途" value={edit.purpose} onChange={(v) => set("purpose", v)} placeholder="メイン・サブ・特典など" /><Field label="プラン" value={edit.plan} onChange={(v) => set("plan", v)} /><Field label="データ容量" value={edit.dataAllowance} onChange={(v) => set("dataAllowance", v)} placeholder="30GBなど" /></>}
      <div style={s.section}><h3 style={s.groupTitle}>料金・契約期間</h3>
        <Field label={isDevice ? "月額（1）" : "基本月額"} value={edit.monthlyAmount} onChange={(v) => set("monthlyAmount", v)} inputMode="decimal" placeholder="未確認の場合は空欄" />
        {isDevice ? <><Field label="月額（2）" value={edit.monthlyAmountLater} onChange={(v) => set("monthlyAmountLater", v)} inputMode="decimal" placeholder="未確認の場合は空欄" /><Field label="契約総額" value={edit.totalAmount} onChange={(v) => set("totalAmount", v)} inputMode="decimal" /><Field label="支払い回数" value={edit.installments} onChange={(v) => set("installments", v)} inputMode="numeric" /><p style={s.muted}>月額（2）への切替時期は、実際の契約内容を確認して定期費へ反映します。</p></> : <><Field label="オプション月額" value={edit.optionAmount} onChange={(v) => set("optionAmount", v)} inputMode="decimal" /><Field label="オプション内容" value={edit.optionNote} onChange={(v) => set("optionNote", v)} /><Field label="通話料金" value={edit.callRate} onChange={(v) => set("callRate", v)} /></>}
        <DateField label="契約開始日" value={edit.startDate} onChange={(v) => set("startDate", v)} />
        <DateField label="終了予定日・解約日" value={edit.endDate} onChange={(v) => set("endDate", v)} />
        <Field label="支払い方法" value={edit.paymentMethod} onChange={(v) => set("paymentMethod", v)} />
        {!!cards.length && <div style={{ ...s.meta, marginTop: 6 }}>{cards.map((card) => <button type="button" key={card.id} style={{ ...styles.optionChip, fontSize: 11, padding: "5px 9px", ...(edit.paymentMethod === card.name ? styles.optionChipActive : {}) }} onClick={() => set("paymentMethod", card.name)}>{card.name}</button>)}</div>}
        <Field label="還元率（%）" value={edit.cashbackRate} onChange={(v) => set("cashbackRate", v)} inputMode="decimal" />
      </div>
      <details style={s.section} open={!!edit.rewardAmount || !!edit.rewardDate}><summary style={{ ...s.groupTitle, cursor: "pointer" }}>ポイント・特典</summary>
        <Field label="付与予定ポイント" value={edit.rewardAmount} onChange={(v) => set("rewardAmount", v)} inputMode="numeric" />
        <DateField label="ポイント付与予定日" value={edit.rewardDate} onChange={(v) => set("rewardDate", v)} />
        <Field label="ポイントの状況" value={edit.rewardStatus || "review"} onChange={(v) => set("rewardStatus", v)}>{Object.entries(REWARD_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Field>
        <Field label="特典・キャンペーン" value={edit.benefitNote} onChange={(v) => set("benefitNote", v)} />
      </details>
      <label style={s.label}>メモ<textarea aria-label="メモ" value={edit.note || ""} onChange={(e) => set("note", e.target.value)} style={{ ...styles.memoTextarea, marginTop: 6 }} /></label>
      {linkedSub && <div style={s.notice}><div>連携中：{linkedSub.name}　{amountText(linkedSub.amount)}/{linkedSub.cycle === "yearly" ? "年" : "月"}</div><label style={s.check}><input type="checkbox" checked={syncFee} onChange={(e) => setSyncFee(e.target.checked)} style={s.checkInput} /><span>定期費の料金・開始日・終了日も更新する</span></label>{linkedSub.cycle === "yearly" && <p style={{ ...s.muted, marginBottom: 0 }}>定期費を更新すると、年払いから月払いに変わります。反映する月額を確認してください。</p>}{syncFee && (isDevice ? <Field label="定期費に反映する月額" value={linkedAmount} onChange={setLinkedAmount} inputMode="decimal" /> : <p style={{ ...s.muted, marginBottom: 0 }}>基本月額と入力済みのオプション月額を月払いとして反映します。</p>)}{edit.status === "ended" && !syncFee && <p style={{ ...s.muted, color: RED, marginBottom: 0 }}>連携先の支払い予定は継続します。終了日も反映する場合は上の項目を選んでください。</p>}</div>}
      {error && <div role="alert" style={s.error}>{error}</div>}
      <button type="submit" style={styles.saveBtn}>{syncFee ? "保存して定期費に反映" : "保存"}</button>
      <button type="button" style={styles.cancelBtn} onClick={onClose}>キャンセル</button>
    </form>
  </Dialog>;
}

function FeeLinkDialog({ contract, subs, cards, onCommit, onClose }) {
  const current = subs.find((sub) => sub.id === contract.linkedSubId);
  const [mode, setMode] = useState(current || subs.length ? "existing" : "new");
  const [subId, setSubId] = useState(current?.id || "");
  const [name, setName] = useState(`${displayName(contract)}${contract.phone ? `（${String(contract.phone).slice(-4)}）` : contract.kind === "device" ? " 端末代" : ""}`);
  const [amount, setAmount] = useState(contract.kind === "line" && contract.monthlyAmount != null ? String(contract.monthlyAmount + (contract.optionAmount || 0)) : "");
  const [card, setCard] = useState(cards.some((c) => c.name === contract.paymentMethod) ? contract.paymentMethod : "");
  const [startDate, setStartDate] = useState(localDate());
  const [endDate, setEndDate] = useState(contract.endDate || "");
  const [error, setError] = useState("");
  const [deviceConfirmed, setDeviceConfirmed] = useState(false);
  const duplicate = subs.find((sub) => normalizeName(sub.name) === normalizeName(name));
  const target = subs.find((sub) => sub.id === subId);
  const submit = (event) => {
    event.preventDefault();
    if (mode === "existing") {
      if (!target) { setError("連携する定期費を選んでください。"); return; }
      onCommit({ ...contract, linkedSubId: target.id }, subs); return;
    }
    if (current) { setError("この契約はすでに定期費に連携しています。既存の定期費を選んでください。"); return; }
    const parsed = evalAmount(amount);
    if (!name.trim() || parsed == null || parsed < 0) { setError("名前と確認済みの月額を入力してください。0円も登録できます。"); return; }
    if (duplicate) { setError("同じ名前の定期費があります。「既存に連携」から選んでください。"); return; }
    if (contract.kind === "device" && !deviceConfirmed) { setError("分割払いとの重複がないことを確認してください。"); return; }
    if (!startDate || (endDate && endDate < startDate)) { setError("計画への反映開始日と終了日を確認してください。"); return; }
    const next = { id: uid(), name: name.trim(), amount: Math.round(parsed), cycle: "monthly", category: contract.kind === "line" ? "通信" : "端末", card, startDate, endDate, autoRenew: true, plan: contract.plan || "", note: contract.benefitNote || "" };
    onCommit({ ...contract, linkedSubId: next.id }, [...subs, next]);
  };
  return <Dialog title="定期費に連携" onClose={onClose}>
    <p style={{ margin: "4px 0 13px", fontSize: 13, lineHeight: 1.6 }}>{displayName(contract)}の料金を、計画の固定費につなぎます。</p>
    <div style={{ ...styles.kindRow, marginBottom: 14 }}>{[["existing", "既存に連携"], ["new", "新しく作成"]].map(([value, label]) => <button type="button" key={value} disabled={value === "new" && !!current} onClick={() => { setMode(value); setError(""); }} style={{ ...styles.kindBtn, opacity: value === "new" && current ? 0.4 : 1, ...(mode === value ? { background: "var(--accent-soft)", borderColor: ACCENT, color: ACCENT } : {}) }}>{label}</button>)}</div>
    {current && <p style={s.muted}>料金や期間の変更は、契約の「編集」から定期費に反映できます。</p>}
    <form onSubmit={submit}>
      {mode === "existing" ? <>
        <Field label="連携する定期費" value={subId} onChange={setSubId}><option value="">選択してください</option>{subs.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}　{amountText(sub.amount)}/{sub.cycle === "yearly" ? "年" : "月"}</option>)}</Field>
        {target && <p style={s.notice}>{target.name}の金額・期間をそのまま使います。</p>}
        {!subs.length && <p style={s.muted}>定期費がまだありません。「新しく作成」から登録できます。</p>}
      </> : <>
        <Field label="定期費の名前" value={name} onChange={setName} />
        <Field label="確認済みの月額" value={amount} onChange={setAmount} inputMode="decimal" placeholder="今の支払額を入力" />
        {contract.kind === "device" && <p style={s.muted}>表の月額（1）：{amountText(contract.monthlyAmount)} ／ 月額（2）：{amountText(contract.monthlyAmountLater)}。今適用されている金額を入力してください。</p>}
        {duplicate && <p style={s.error}>同じ名前の定期費が登録されています。</p>}
        <Field label="支払いカード" value={card} onChange={setCard}><option value="">未設定</option>{cards.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</Field>
        <DateField label="計画への反映開始日" value={startDate} onChange={setStartDate} />
        <DateField label="反映終了日（任意）" value={endDate} onChange={setEndDate} />
        {contract.kind === "device" && <><p style={s.muted}>分割払いに登録済みの場合は、追加せず契約情報だけ管理できます。</p><label style={s.check}><input type="checkbox" checked={deviceConfirmed} onChange={(e) => setDeviceConfirmed(e.target.checked)} style={s.checkInput} /><span>この端末代を分割払いに重複登録していない</span></label></>}
      </>}
      {error && <div role="alert" style={s.error}>{error}</div>}
      <button type="submit" style={styles.saveBtn}>{mode === "existing" ? "この定期費に連携する" : "定期費を作成して連携"}</button>
      {current && <button type="button" style={styles.deleteBtn} onClick={() => { const next = { ...contract }; delete next.linkedSubId; onCommit(next, subs); }}>連携を解除する（定期費は残す）</button>}
      <button type="button" style={styles.cancelBtn} onClick={onClose}>キャンセル</button>
    </form>
  </Dialog>;
}

function ContractDetail({ contract, linkedSub, onClose, onEdit, onLink, onChange, onDelete }) {
  const [showNumber, setShowNumber] = useState(false);
  const points = contract.rewardAmount;
  const milestone = contractMilestones(contract);
  const number = contract.kind === "line" ? contract.phone : contract.contractNumber;
  return <Dialog title={displayName(contract)} onClose={onClose}>
    <div style={s.row}><Tag color={statusColor(contract.status)}>{STATUS[contract.status] || "要確認"}</Tag><button type="button" style={s.smallButton} onClick={onEdit}>編集</button></div>
    {number && <div style={{ ...s.row, margin: "12px 0 5px" }}><span style={{ fontSize: 16, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", minWidth: 0 }}>{showNumber ? number : masked(number)}</span><button type="button" style={{ ...styles.chipGhost, flexShrink: 0 }} onClick={() => setShowNumber((v) => !v)}>{showNumber ? "番号を隠す" : "番号を表示"}</button></div>}
    <Fact label="キャリア" value={contract.carrier} /><Fact label="利用端末・機種" value={contract.device} /><Fact label="用途" value={contract.purpose} /><Fact label="プラン" value={contract.plan} /><Fact label="データ容量" value={contract.dataAllowance} />
    <div style={s.section}><h3 style={s.groupTitle}>記録している料金</h3>
      <Fact label={contract.kind === "device" ? "月額（1）" : "基本月額"} value={amountText(contract.monthlyAmount)} />
      {contract.kind === "device" ? <><Fact label="月額（2）" value={amountText(contract.monthlyAmountLater)} /><Fact label="契約総額" value={amountText(contract.totalAmount)} /><Fact label="支払い回数" value={contract.installments ? `${contract.installments}回` : ""} /></> : <><Fact label="オプション月額" value={contract.optionAmount == null ? "" : amountText(contract.optionAmount)} /><Fact label="オプション" value={contract.optionNote} /><Fact label="通話料金" value={contract.callRate} /></>}
      <Fact label="支払い方法" value={contract.paymentMethod} /><Fact label="還元率" value={contract.cashbackRate == null ? "" : `${(contract.cashbackRate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}%`} />
    </div>
    <div style={s.section}><h3 style={s.groupTitle}>契約の日付</h3><Fact label="契約開始" value={dateText(contract.startDate)} /><Fact label="終了・解約" value={contract.endDate ? dateText(contract.endDate) : ""} />
      {contract.kind === "line" ? <Fact label="180日後" value={dateText(milestone.day180)} /> : <><Fact label="13か月後" value={dateText(milestone.month13)} /><Fact label="25か月後" value={dateText(milestone.month25)} /></>}
      <p style={{ ...s.muted, marginBottom: 0 }}>契約開始からの目安です。解約・返却の条件は契約内容で確認できます。</p>
    </div>
    {(points != null || contract.rewardDate || contract.benefitNote) && <div style={s.section}><h3 style={s.groupTitle}>ポイント・特典</h3><Fact label="付与予定" value={points == null ? "" : `${Number(points).toLocaleString("ja-JP")} pt`} /><Fact label="予定日" value={contract.rewardDate ? dateText(contract.rewardDate) : ""} /><Fact label="状況" value={REWARD_STATUS[contract.rewardStatus] || "要確認"} /><Fact label="特典" value={contract.benefitNote} />{(points != null || contract.rewardDate) && <button type="button" style={styles.backupBtn} onClick={() => onChange({ ...contract, rewardStatus: contract.rewardStatus === "received" ? "pending" : "received" })}>{contract.rewardStatus === "received" ? "付与待ちに戻す" : "ポイントを受取済みにする"}</button>}</div>}
    <div style={s.section}><h3 style={s.groupTitle}>家計簿との連携</h3>{linkedSub ? <><Fact label="定期費" value={linkedSub.name} /><Fact label="計画に使う額" value={`${amountText(linkedSub.amount)} / ${linkedSub.cycle === "yearly" ? "年" : "月"}`} />{contract.status === "ended" && (!linkedSub.endDate || linkedSub.endDate >= localDate()) && <p style={{ ...s.notice, color: RED }}>連携先の支払い予定は継続中です。「編集」から終了日を定期費へ反映できます。</p>}<button type="button" style={styles.backupBtn} onClick={onLink}>定期費の連携を変更</button></> : <><p style={s.muted}>定期費へ連携すると、計画の固定費に反映されます。</p><button type="button" style={styles.backupBtn} onClick={onLink}>定期費に連携する</button></>}</div>
    {contract.note && <div style={s.section}><h3 style={s.groupTitle}>メモ</h3><p style={{ ...s.muted, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{contract.note}</p></div>}
    {!!contract.history?.length && <details style={s.section}><summary style={{ ...s.groupTitle, cursor: "pointer" }}>以前の契約</summary>{contract.history.map((item, i) => <div key={i} style={{ ...s.muted, padding: "5px 0" }}>{item.carrier || "以前の契約"}{item.plan ? ` / ${item.plan}` : ""}{item.startDate ? `　${dateText(item.startDate)}` : ""}</div>)}</details>}
    {contract.status === "review" && <button type="button" style={styles.saveBtn} onClick={() => onChange({ ...contract, status: "active" })}>利用中として確認</button>}
    <button type="button" style={styles.deleteBtn} onClick={onDelete}>契約記録を削除</button>
    <button type="button" style={styles.cancelBtn} onClick={onClose}>閉じる</button>
  </Dialog>;
}

function ImportPreview({ parsed, filename, contracts, subs, cards, onCommit, onClose }) {
  const [includeContracts, setIncludeContracts] = useState(true);
  const [selected, setSelected] = useState([]);
  const [cardChoices, setCardChoices] = useState(() => Object.fromEntries(parsed.subscriptions.map((candidate) => [candidate.id, cards.some((card) => card.name === candidate.paymentMethod) ? candidate.paymentMethod : ""])));
  const merged = useMemo(() => mergeContractImports(contracts, parsed.contracts), [contracts, parsed]);
  const proposals = useMemo(() => planSubscriptionImport(subs, parsed.subscriptions), [subs, parsed]);
  const selectable = proposals.filter((p) => p.action === "new" && isImportableSubscriptionAmount(p.candidate.sub.amount));
  const eligibleSelected = selected.filter((id) => selectable.some((p) => p.candidate.id === id));
  const newContractCount = includeContracts ? merged.added : 0;
  const total = newContractCount + eligibleSelected.length;
  const submit = () => {
    const nextContracts = includeContracts ? mergeContractImports(contracts, parsed.contracts) : { contracts, added: 0, skipped: 0 };
    const candidates = parsed.subscriptions.map((candidate) => ({ ...candidate, sub: { ...candidate.sub, card: cardChoices[candidate.id] || "" } }));
    const nextSubs = mergeSubscriptionImports(subs, candidates, eligibleSelected);
    onCommit({ contracts: nextContracts.contracts, subs: nextSubs.subs }, `${nextContracts.added}件の契約と${nextSubs.added}件の定期費を追加しました。`);
  };
  return <Dialog title="チェックシートを取り込む" onClose={onClose}>
    <p style={{ ...s.muted, overflowWrap: "anywhere", margin: "0 0 12px" }}>{filename}</p>
    <div style={s.notice}>回線 {parsed.contracts.filter((c) => c.kind === "line").length}件 ／ 端末 {parsed.contracts.filter((c) => c.kind === "device").length}件 ／ サブスク {parsed.subscriptions.length}件</div>
    {!!parsed.contracts.length && <div style={s.section}>
      <label style={{ ...s.check, marginTop: 0 }}><input type="checkbox" checked={includeContracts} onChange={(e) => setIncludeContracts(e.target.checked)} style={s.checkInput} /><span><strong>回線・端末の契約情報を取り込む</strong><span style={{ ...s.muted, display: "block" }}>新規{merged.added}件{merged.skipped ? `・登録済み${merged.skipped}件` : ""}。取り込み後、利用状況と定期費への連携を確認できます。</span></span></label>
      <details style={{ marginTop: 12 }}><summary style={{ ...s.muted, color: ACCENT, cursor: "pointer" }}>契約の一覧を見る</summary><div style={{ marginTop: 8 }}>{parsed.contracts.map((contract) => <div key={contract.id} style={{ ...s.row, alignItems: "flex-start", padding: "9px 0", borderBottom: `1px solid ${LINE}`, fontSize: 12 }}><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{displayName(contract)}<span style={{ ...s.muted, display: "block" }}>{contract.phone ? masked(contract.phone) : contract.carrier || "端末"}</span></span><span style={{ flexShrink: 0, textAlign: "right" }}>{amountText(contract.monthlyAmount)}<span style={{ ...s.muted, display: "block" }}>{contract.kind === "device" ? "月額（1）" : "基本月額"}</span></span></div>)}</div></details>
    </div>}
    {!!parsed.subscriptions.length && <div style={s.section}>
      <h3 style={s.groupTitle}>定期費に追加するサブスク</h3>
      <p style={{ ...s.muted, margin: "0 0 8px" }}>現在も利用しているものを選んでください。登録済みの金額や更新日はそのまま保持します。</p>
      {!!selectable.length && <button type="button" style={{ ...styles.chipGhost, color: ACCENT, padding: "5px 0 9px" }} onClick={() => setSelected(eligibleSelected.length === selectable.length ? [] : selectable.map((p) => p.candidate.id))}>{eligibleSelected.length === selectable.length ? "選択を解除" : "新しい項目をすべて選択"}</button>}
      {proposals.map(({ candidate, action, matches }) => {
        const checked = eligibleSelected.includes(candidate.id);
        const sub = candidate.sub;
        const validAmount = isImportableSubscriptionAmount(sub.amount);
        const canSelect = action === "new" && validAmount;
        return <div key={candidate.id} style={{ borderBottom: `1px solid ${LINE}`, paddingBottom: 10, marginTop: 10, opacity: canSelect ? 1 : 0.75 }}><label style={{ ...s.check, marginTop: 0, cursor: canSelect ? "pointer" : "default" }}>
          <input type="checkbox" checked={checked} disabled={!canSelect} onChange={(e) => setSelected((old) => e.target.checked ? [...old, candidate.id] : old.filter((id) => id !== candidate.id))} style={s.checkInput} />
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontWeight: 600 }}>{sub.name}</span><span style={s.muted}>{amountText(sub.amount)} / {sub.cycle === "yearly" ? "年" : "月"}</span><span style={{ display: "block", fontSize: 11, color: action === "ambiguous" || (action === "new" && !validAmount) ? RED : MUTED }}>{action === "match" ? `登録済み：${matches[0]?.name || "既存の定期費"}（内容を維持）` : action === "ambiguous" ? "候補が複数あります。既存の定期費で確認してください。" : !validAmount ? "料金を確認してください" : "新しく追加"}</span></span>
        </label>{checked && <div style={{ marginLeft: 26 }}><Field label={`${sub.name}の支払いカード`} value={cardChoices[candidate.id] || ""} onChange={(value) => setCardChoices((old) => ({ ...old, [candidate.id]: value }))}><option value="">未設定</option>{cards.map((card) => <option key={card.id} value={card.name}>{card.name}</option>)}</Field>{candidate.paymentMethod && <p style={{ ...s.muted, margin: "5px 0 0", fontSize: 11 }}>元の表：{candidate.paymentMethod}</p>}</div>}</div>;
      })}
    </div>}
    {!!parsed.warnings.length && <details style={s.section}><summary style={{ ...s.muted, cursor: "pointer" }}>読み取り時の確認事項（{parsed.warnings.length}）</summary>{parsed.warnings.map((warning, i) => <p key={i} style={s.muted}>{warning}</p>)}</details>}
    <button type="button" disabled={!total} style={{ ...styles.saveBtn, opacity: total ? 1 : 0.45 }} onClick={submit}>{total ? `${total}件を取り込む` : "追加する項目はありません"}</button>
    <button type="button" style={styles.cancelBtn} onClick={onClose}>キャンセル</button>
  </Dialog>;
}

export function Contracts({ contracts = [], subs = [], cards = [], ym, onCommit, onSaveContracts, onSaveSubs }) {
  const [view, setView] = useState("line");
  const [showEnded, setShowEnded] = useState(false);
  const [dateFilter, setDateFilter] = useState("future");
  const [selectedId, setSelectedId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [linkId, setLinkId] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef(null);
  const currentMonth = ym || localDate().slice(0, 7);
  const apply = (data) => { if (onCommit) onCommit(data); else { onSaveContracts?.(data.contracts); onSaveSubs?.(data.subs); } };
  const changeContract = (next) => apply({ contracts: contracts.map((c) => c.id === next.id ? next : c), subs });
  const selected = contracts.find((c) => c.id === selectedId);
  const linking = contracts.find((c) => c.id === linkId);
  const linked = (contract) => subs.find((sub) => sub.id === contract?.linkedSubId);
  const visibleContracts = contracts.filter((c) => c.kind === view && (showEnded || c.status !== "ended"));
  const linkedIds = new Set(contracts.map((c) => c.linkedSubId).filter(Boolean));
  const linkedSubs = subs.filter((sub) => linkedIds.has(sub.id) && subActiveForMonth(sub, currentMonth));
  const monthly = linkedSubs.reduce((total, sub) => total + subMonthly(sub), 0);
  const linkedCount = contracts.filter((c) => linked(c)).length;
  const milestones = useMemo(() => {
    const items = [];
    for (const contract of contracts.filter((c) => c.status !== "ended")) {
      const days = contractMilestones(contract);
      const add = (key, label, date) => { if (date) items.push({ id: `${contract.id}-${key}`, contract, label, date, days: dateDiff(date), type: key }); };
      if (contract.kind === "line") add("day180", "契約から180日", days.day180);
      else { add("month13", "契約から13か月", days.month13); add("month25", "契約から25か月", days.month25); }
      if (contract.rewardStatus !== "received") add("reward", "ポイント付与予定", contract.rewardDate);
    }
    return items.filter((item) => item.days != null).sort((a, b) => a.date.localeCompare(b.date));
  }, [contracts]);
  const upcoming = milestones.filter((item) => item.days >= 0 && item.days <= 30);
  const dateItems = milestones.filter((item) => dateFilter === "future" ? item.days >= 0 : dateFilter === "past" ? item.days < 0 : true);
  const openFile = async (file) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const sheets = await readContractWorkbook(file);
      const parsed = parseContractWorkbook(sheets);
      if (!parsed.contracts.length && !parsed.subscriptions.length) throw new Error("回線・端末・サブスクの表が見つかりませんでした。チェックシートの形式を確認してください。");
      setPendingImport({ parsed, filename: file.name });
    } catch (failure) { setError(failure?.message || "ファイルを読み込めませんでした。"); }
    finally { setBusy(false); }
  };
  const saveEdit = (contract, syncFee, confirmedFee) => {
    const nextContracts = contracts.some((c) => c.id === contract.id) ? contracts.map((c) => c.id === contract.id ? contract : c) : [...contracts, contract];
    const nextSubs = syncFee && contract.linkedSubId ? subs.map((sub) => sub.id === contract.linkedSubId ? { ...sub, amount: Math.round(confirmedFee), cycle: "monthly", startDate: contract.startDate || "", endDate: contract.endDate || "" } : sub) : subs;
    apply({ contracts: nextContracts, subs: nextSubs }); setEdit(null); setSelectedId(contract.id); setMessage("契約を保存しました。");
  };
  return <div style={s.body}>
    <div style={{ ...s.row, alignItems: "flex-start", margin: "5px 2px 12px" }}><div><h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>回線・端末の契約</h2><p style={{ ...s.muted, margin: "4px 0 0" }}>支払いと特典、見直す日をまとめて管理</p></div><button type="button" disabled={busy} onClick={() => fileInput.current?.click()} style={{ ...s.smallButton, flexShrink: 0, color: ACCENT }}>{busy ? "読込中…" : "Excel取込"}</button><input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="契約チェックシートを選択" style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) openFile(file); }} /></div>
    {message && <div role="status" style={styles.flash}>{message}</div>}{error && <div role="alert" style={s.error}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 9, marginBottom: 13 }}>
      <div style={{ ...styles.sumCell, padding: "12px" }}><div style={styles.sumCellLabel}>連携した定期費・月換算</div><div style={{ ...styles.sumCellValue, fontSize: 21 }}>{yen(monthly)}</div><div style={{ ...s.muted, fontSize: 10.5, marginTop: 4 }}>{linkedCount} / {contracts.length}契約を連携</div></div>
      <button type="button" onClick={() => { setView("dates"); setDateFilter("future"); }} style={{ ...styles.sumCell, padding: "12px", textAlign: "left", fontFamily: "inherit", cursor: "pointer", color: INK }}><div style={styles.sumCellLabel}>30日以内の予定</div><div style={{ ...styles.sumCellValue, fontSize: 21 }}>{upcoming.length}<span style={{ fontSize: 12, marginLeft: 3, fontWeight: 400 }}>件</span></div><div style={{ ...s.muted, fontSize: 10.5, marginTop: 4 }}>ポイント・契約の目安</div></button>
    </div>
    <div style={{ ...styles.viewToggle, display: "flex" }}>{[["line", "回線"], ["device", "端末"], ["dates", "期限"]].map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} style={{ ...styles.viewToggleBtn, flex: 1, ...(view === key ? styles.viewToggleActive : {}) }} onClick={() => setView(key)}>{label}{key !== "dates" ? ` ${contracts.filter((c) => c.kind === key && c.status !== "ended").length}` : ""}</button>)}</div>
    {view !== "dates" ? <>
      <div style={{ ...s.row, margin: "2px 2px 10px" }}><label style={{ ...s.check, marginTop: 0, fontSize: 11.5, color: MUTED }}><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} style={{ ...s.checkInput, width: 14, height: 14 }} />終了した契約も表示</label><button type="button" style={styles.addBtn} onClick={() => setEdit({ kind: view, name: "", status: "review", rewardStatus: "review" })}>＋ 追加</button></div>
      {visibleContracts.map((contract) => {
        const fee = linked(contract);
        const date = contractMilestones(contract);
        return <button type="button" key={contract.id} style={s.cardButton} onClick={() => setSelectedId(contract.id)} aria-label={`${displayName(contract)}の詳細`}>
          <div style={{ ...s.row, alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{displayName(contract)}</div><div style={{ ...s.muted, marginTop: 4 }}>{contract.kind === "line" ? masked(contract.phone) : contract.carrier || "契約先未登録"}{contract.kind === "line" && contract.device ? ` · ${contract.device}` : ""}</div></div><div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{amountText(contract.monthlyAmount)}</div><div style={{ ...s.muted, fontSize: 10.5 }}>{contract.kind === "device" ? "月額（1）" : "基本月額"}</div></div></div>
          <div style={s.meta}><Tag color={statusColor(contract.status)}>{STATUS[contract.status] || "要確認"}</Tag>{contract.purpose && <Tag>{contract.purpose}</Tag>}{fee ? <Tag color={ACCENT}>定期費に連携済み</Tag> : <Tag>定期費は未連携</Tag>}{contract.rewardStatus === "received" && <Tag>ポイント受取済み</Tag>}</div>
          <div style={{ ...s.muted, marginTop: 9, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>{contract.kind === "line" ? `${contract.plan || "プラン未登録"}${contract.dataAllowance ? ` / ${contract.dataAllowance}` : ""}` : `25か月後　${dateText(date.month25)}`}{contract.kind === "line" && date.day180 ? <span style={{ display: "block", marginTop: 2 }}>180日後　{dateText(date.day180)}</span> : null}</div>
        </button>;
      })}
      {!visibleContracts.length && <div style={{ ...styles.detailCard, padding: "24px 16px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 600 }}>{view === "line" ? "回線" : "端末"}の契約をまとめよう</div><p style={{ ...s.muted, margin: "8px 0 14px" }}>Excelのチェックシートを読み込むか、<br />「追加」から登録できます。</p><button type="button" style={{ ...styles.addBtn, padding: "9px 14px" }} disabled={busy} onClick={() => fileInput.current?.click()}>Excelから取り込む</button></div>}
    </> : <>
      <div style={{ display: "flex", gap: 6, margin: "2px 0 12px" }}>{[["future", "これから"], ["past", "日付経過"], ["all", "すべて"]].map(([value, label]) => <button type="button" key={value} aria-pressed={dateFilter === value} style={{ ...styles.optionChip, fontSize: 11.5, padding: "6px 11px", ...(dateFilter === value ? styles.optionChipActive : {}) }} onClick={() => setDateFilter(value)}>{label}</button>)}</div>
      <p style={{ ...s.muted, margin: "0 2px 12px" }}>180日・13/25か月は契約開始からの目安です。</p>
      {dateItems.map((item) => <button type="button" key={item.id} style={{ ...s.cardButton, padding: "12px 13px" }} onClick={() => setSelectedId(item.contract.id)}><div style={s.row}><span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{dateText(item.date)}</span><Tag color={item.days < 0 ? MUTED : item.days <= 30 ? ACCENT : MUTED}>{item.days < 0 ? `${Math.abs(item.days)}日経過` : item.days === 0 ? "今日" : `あと${item.days}日`}</Tag></div><div style={{ fontSize: 13, marginTop: 8 }}>{item.label}{item.type === "reward" && item.contract.rewardAmount != null ? ` · ${Number(item.contract.rewardAmount).toLocaleString("ja-JP")} pt` : ""}</div><div style={{ ...s.muted, marginTop: 3 }}>{displayName(item.contract)}{item.contract.phone ? `　${masked(item.contract.phone)}` : ""}</div></button>)}
      {!dateItems.length && <div style={{ ...styles.detailCard, padding: "22px 14px", textAlign: "center", ...s.muted }}>{dateFilter === "past" ? "日付を過ぎた予定はありません。" : "この範囲の予定はありません。"}</div>}
    </>}
    {selected && <ContractDetail key={selected.id} contract={selected} linkedSub={linked(selected)} onClose={() => setSelectedId(null)} onEdit={() => { setEdit(selected); setSelectedId(null); }} onLink={() => { setLinkId(selected.id); setSelectedId(null); }} onChange={changeContract} onDelete={() => { if (window.confirm("この契約記録を削除しますか？連携中の定期費は残ります。")) { apply({ contracts: contracts.filter((c) => c.id !== selected.id), subs }); setSelectedId(null); } }} />}
    {edit && <ContractEditor key={edit.id || `new-${edit.kind}`} contract={edit} existingContracts={contracts} linkedSub={linked(edit)} cards={cards} onClose={() => setEdit(null)} onSave={saveEdit} />}
    {linking && <FeeLinkDialog contract={linking} subs={subs} cards={cards} onClose={() => setLinkId(null)} onCommit={(contract, nextSubs) => { apply({ contracts: contracts.map((c) => c.id === contract.id ? contract : c), subs: nextSubs }); setLinkId(null); setSelectedId(contract.id); setMessage("定期費の連携を更新しました。"); }} />}
    {pendingImport && <ImportPreview {...pendingImport} contracts={contracts} subs={subs} cards={cards} onClose={() => setPendingImport(null)} onCommit={(data, status) => { apply(data); setPendingImport(null); setMessage(status); }} />}
  </div>;
}
