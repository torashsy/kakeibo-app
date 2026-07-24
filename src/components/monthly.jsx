import React, { useMemo, useState } from "react";
import { INK, LINE, MUTED, RED, GREEN } from '../theme.js';
import { yen, periodLabel, addMonth, evalAmount, acctRole } from '../utils';
import { styles } from '../styles.js';
import { AmountField } from './amount.jsx';

// 今月をまとめて入力。給与・カード請求・月末残高を1画面に並べ、
// 前月(または今月の既存記録)をプリセットして「変わったところだけ直して1回保存」できるようにする。
// 口座は月末残高だけでOK(引出・入金・投資振替を1件ずつ入れなくても使いすぎ/年間収支は出せる)。
// カードは「その月の合計」を扱う。既存の明細合計と同じなら手を触れず、変えたときだけ1件の合計に置き換える。
export function MonthlyClose({ ym, config, cards, entries, onClose, onSave }) {
  const prevYm = addMonth(ym, -1);
  const salaryItems = config.salaryItems || [];
  const accounts = config.accounts || [];

  // プリセット: 今月の記録があればそれ、無ければ前月、どちらも無ければ空。
  // fromPrev=true のときは「前月」バッジを出して、前月値を仮置きしていることを示す。
  const salaryInit = useMemo(() => salaryItems.map((item) => {
    const cur = entries.find((e) => e.ym === ym && e.cat === "salary" && e.item === item);
    if (cur) return { item, amount: String(Math.abs(cur.amount)), fromPrev: false };
    const prev = entries.find((e) => e.ym === prevYm && e.cat === "salary" && e.item === item);
    return { item, amount: prev ? String(Math.abs(prev.amount)) : "", fromPrev: !!prev };
  }), [entries, ym, prevYm, salaryItems]);

  const sumCard = (list, name, m) => list.filter((e) => e.ym === m && e.cat === "card" && e.item === name).reduce((a, e) => a + Math.abs(e.amount), 0);
  const cardInit = useMemo(() => (cards || []).map((c) => {
    const cur = sumCard(entries, c.name, ym);
    if (cur > 0) return { name: c.name, amount: String(cur), fromPrev: false, baseSum: cur };
    const prev = sumCard(entries, c.name, prevYm);
    return { name: c.name, amount: prev > 0 ? String(prev) : "", fromPrev: prev > 0, baseSum: 0 };
  }), [entries, ym, prevYm, cards]);

  const balOf = (m, account) => { const f = entries.find((e) => e.ym === m && e.cat === "account" && e.account === account && acctRole(e.item) === "bal"); return f ? f.amount : null; };
  const balInit = useMemo(() => accounts.map((account) => {
    const cur = balOf(ym, account);
    if (cur != null) return { account, amount: String(cur), fromPrev: false };
    const prev = balOf(prevYm, account);
    return { account, amount: prev != null ? String(prev) : "", fromPrev: prev != null };
  }), [entries, ym, prevYm, accounts]);

  const [salary, setSalary] = useState(salaryInit);
  const [cardRows, setCardRows] = useState(cardInit);
  const [balRows, setBalRows] = useState(balInit);

  const setSal = (i, v) => setSalary((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v, fromPrev: false } : r)));
  const setCard = (i, v) => setCardRows((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v, fromPrev: false } : r)));
  const setBal = (i, v) => setBalRows((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v, fromPrev: false } : r)));

  const takeHome = salary.reduce((a, r) => { const v = evalAmount(r.amount); if (v == null) return a; return a + (r.item === "控除" ? -Math.abs(v) : v); }, 0);
  const cardTotal = cardRows.reduce((a, r) => { const v = evalAmount(r.amount); return a + (v == null ? 0 : Math.abs(v)); }, 0);
  const balTotal = balRows.reduce((a, r) => { const v = evalAmount(r.amount); return a + (v == null ? 0 : v); }, 0);
  const balHasAny = balRows.some((r) => evalAmount(r.amount) != null);

  // 「今月の動き」プレビュー。前月の残高合計が分かれば、残高の増減と
  // 給与・カードから「現金・その他で出た分(使途不明)」を自動で割り出して流れを見せる。
  // ＝ 1件ずつ入れなくても、どこかに消えたお金の総額が見える。
  const prevBalTotal = useMemo(() => {
    const b = {};
    for (const e of entries) if (e.ym === prevYm && e.cat === "account" && acctRole(e.item) === "bal") b[e.account] = e.amount;
    return Object.keys(b).length ? Object.values(b).reduce((a, x) => a + x, 0) : null;
  }, [entries, prevYm]);
  // 前月の値をそのまま仮置きしている間は「増減0」で誤解を招くので、
  // 今月ぶんの残高が実際に入っている(fromPrevでない)ときだけ動きを出す。
  const balEnteredThisMonth = balRows.some((r) => evalAmount(r.amount) != null && !r.fromPrev);
  const showFlow = balEnteredThisMonth && prevBalTotal != null;
  const balChange = balTotal - (prevBalTotal || 0);
  const otherOut = (takeHome - cardTotal) - balChange; // 正なら現金など判明外の流出

  const submit = () => {
    onSave(ym, {
      salary: salary.map((r) => ({ item: r.item, amount: r.amount })),
      cards: cardRows.map((r) => ({ name: r.name, amount: r.amount, baseSum: r.baseSum })),
      balances: balRows.map((r) => ({ account: r.account, amount: r.amount })),
    });
    onClose();
  };

  return (
    <div style={styles.sheetBackdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={styles.sheetTitle}>今月をまとめて入力（{periodLabel(ym, config.cycleCutoffDay)}）</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.6 }}>
          前月の値を仮に入れてあります。変わったところだけ直して保存してください。
          口座は<b>月末残高だけ</b>でOK（引出・入金は任意）。
        </div>

        {salaryItems.length > 0 && (
          <>
            <div style={styles.mcHead}>給与系</div>
            {salary.map((r, i) => (
              <div key={r.item} style={styles.mcRow}>
                <span style={styles.mcName}>{r.item}{r.fromPrev && r.amount !== "" && <span style={styles.mcPrev}>前月</span>}</span>
                <div style={{ flex: 1 }}>
                  <AmountField value={r.amount} onChange={(v) => setSal(i, v)} wrapStyle={styles.mcField} inputStyle={{ fontSize: 16 }} />
                </div>
              </div>
            ))}
            <div style={styles.mcSub}><span>手取り見込み</span><span style={{ color: GREEN, fontWeight: 600 }}>{yen(takeHome)}</span></div>
          </>
        )}

        {(cards || []).length > 0 && (
          <>
            <div style={styles.mcHead}>カード請求（今月の合計）</div>
            {cardRows.map((r, i) => (
              <div key={r.name} style={styles.mcRow}>
                <span style={styles.mcName}>{r.name}{r.fromPrev && r.amount !== "" && <span style={styles.mcPrev}>前月</span>}</span>
                <div style={{ flex: 1 }}>
                  <AmountField value={r.amount} onChange={(v) => setCard(i, v)} wrapStyle={styles.mcField} inputStyle={{ fontSize: 16 }} />
                </div>
              </div>
            ))}
            <div style={styles.mcSub}><span>カード合計</span><span style={{ color: RED, fontWeight: 600 }}>{yen(cardTotal)}</span></div>
          </>
        )}

        {accounts.length > 0 && (
          <>
            <div style={styles.mcHead}>月末の口座残高</div>
            {balRows.map((r, i) => (
              <div key={r.account} style={styles.mcRow}>
                <span style={styles.mcName}>{r.account}{r.fromPrev && r.amount !== "" && <span style={styles.mcPrev}>前月</span>}</span>
                <div style={{ flex: 1 }}>
                  <AmountField value={r.amount} onChange={(v) => setBal(i, v)} wrapStyle={styles.mcField} inputStyle={{ fontSize: 16 }} />
                </div>
              </div>
            ))}
            {balHasAny && <div style={styles.mcSub}><span>残高合計</span><span style={{ fontWeight: 600 }}>{yen(balTotal)}</span></div>}
          </>
        )}

        {!showFlow && accounts.length > 0 && (
          <div style={{ ...styles.mcFlow, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>月末の口座残高を入れると、<br />「今月の動き（現金・その他で出た分）」を自動で計算します。</div>
          </div>
        )}
        {showFlow && (
          <div style={styles.mcFlow}>
            <div style={styles.mcFlowHead}>今月の動き</div>
            <div style={styles.mcFlowRow}><span>入ってきた（給与）</span><span style={{ color: GREEN }}>{yen(takeHome)}</span></div>
            <div style={styles.mcFlowRow}><span>カード引き落とし</span><span style={{ color: RED }}>{yen(-cardTotal)}</span></div>
            <div style={styles.mcFlowRow}><span>残高の増減（実際）</span><span style={{ color: balChange >= 0 ? GREEN : RED }}>{yen(balChange)}</span></div>
            <div style={{ ...styles.mcFlowRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 8, fontWeight: 600 }}>
              <span>現金・その他で出た分</span>
              <span style={{ color: otherOut > 0 ? RED : GREEN }}>{yen(-Math.max(0, Math.round(otherOut)))}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
              {otherOut > 0
                ? "カード以外で出ていったお金です。特定したい分は ＋ で「引出」を記録すると内訳に残せます。"
                : "残高の増減は給与とカードでほぼ説明できています。"}
            </div>
          </div>
        )}

        <button style={styles.saveBtn} onClick={submit}>この内容で保存</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
