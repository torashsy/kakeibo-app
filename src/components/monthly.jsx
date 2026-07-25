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

  // 現金・投資・送金の月合計。自分の口座どうしの移動(投資以外)は残高で吸収されるので入力しない。
  // 投資振替は銀行残高が減るが「使った」わけではないため、支出(使いすぎ)ではなく貯蓄として扱う。
  // key は ACCOUNT_TYPES の項目名、dir は残高に対する符号。
  const FLOW_DEFS = [
    { key: "引出", label: "現金引出", dir: -1, kind: "spend", hint: "現金として引き出した額" },
    { key: "出金", label: "送金した", dir: -1, kind: "spend", hint: "他の人への送金・支払い" },
    { key: "入金", label: "受け取った", dir: +1, kind: "income", hint: "他の人からの受け取り" },
    { key: "投資振替", label: "投資へ入れた", dir: -1, kind: "invest", hint: "投資口座へ振り替えた額（残高は減るが貯蓄）" },
    { key: "投資戻し", label: "投資から戻した", dir: +1, kind: "invest", hint: "投資口座から戻した額" },
  ];
  // 投資振替は1つの項目名に符号で方向を持たせている(入=−/戻し=＋)ので、入力欄は2つに分けて集計する。
  // 記録タブは口座ごとに入出金を並べるため、どの口座からの動きかも持たせる(既定は主口座＝先頭)。
  const matchFlow = (e, def) => e.cat === "account" && (
    def.key === "投資戻し" ? e.item === "投資振替" && e.amount > 0
      : def.key === "投資振替" ? e.item === "投資振替" && e.amount < 0
        : e.item === def.key);
  const sumFlow = (m, def, account) => entries
    .filter((e) => e.ym === m && e.account === account && matchFlow(e, def))
    .reduce((a, e) => a + Math.abs(e.amount), 0);
  const flowInit = useMemo(() => FLOW_DEFS.map((def) => {
    // 既存記録があればその口座を引き継ぎ、無ければ主口座
    const found = entries.find((e) => e.ym === ym && matchFlow(e, def));
    const account = (found && found.account) || accounts[0] || "";
    const cur = sumFlow(ym, def, account);
    return { ...def, account, amount: cur > 0 ? String(cur) : "", baseSum: cur };
  }), [entries, ym, accounts]);

  const [salary, setSalary] = useState(salaryInit);
  const [cardRows, setCardRows] = useState(cardInit);
  const [balRows, setBalRows] = useState(balInit);
  const [flowRows, setFlowRows] = useState(flowInit);

  const setSal = (i, v) => setSalary((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v, fromPrev: false } : r)));
  const setCard = (i, v) => setCardRows((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v, fromPrev: false } : r)));
  const setBal = (i, v) => setBalRows((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v, fromPrev: false } : r)));
  const setFlow = (i, v) => setFlowRows((p) => p.map((r, idx) => (idx === i ? { ...r, amount: v } : r)));
  // 口座を変えたら、その口座の既存合計を基準(baseSum)に取り直す(別口座の記録を消さないため)
  const setFlowAccount = (i, account) => setFlowRows((p) => p.map((r, idx) => {
    if (idx !== i) return r;
    const base = sumFlow(ym, r, account);
    return { ...r, account, baseSum: base, amount: r.amount === "" || Number(r.amount) === r.baseSum ? (base > 0 ? String(base) : "") : r.amount };
  }));

  const takeHome = salary.reduce((a, r) => { const v = evalAmount(r.amount); if (v == null) return a; return a + (r.item === "控除" ? -Math.abs(v) : v); }, 0);
  const cardTotal = cardRows.reduce((a, r) => { const v = evalAmount(r.amount); return a + (v == null ? 0 : Math.abs(v)); }, 0);
  const balTotal = balRows.reduce((a, r) => { const v = evalAmount(r.amount); return a + (v == null ? 0 : v); }, 0);
  const balHasAny = balRows.some((r) => evalAmount(r.amount) != null);
  const flowAmt = (kind, dir) => flowRows.reduce((a, r) => { if (r.kind !== kind || (dir && r.dir !== dir)) return a; const v = evalAmount(r.amount); return a + (v == null ? 0 : Math.abs(v)); }, 0);
  const cashSpend = flowAmt("spend");                                  // 現金引出＋送金(消費)
  const otherIncome = flowAmt("income");                               // 受け取り(収入)
  const investIn = flowAmt("invest", -1), investBack = flowAmt("invest", +1);
  const investNet = investIn - investBack;                             // 正なら投資へ回した純額

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
  // 説明できる増減 = 給与 + 受取 − カード − 現金/送金 − 投資へ入れた純額。
  // 実際の残高増減との差が「まだ説明できていない分(使途不明)」。
  const explained = takeHome + otherIncome - cardTotal - cashSpend - investNet;
  const unexplained = explained - balChange; // 正なら記録に無い流出

  const submit = () => {
    onSave(ym, {
      salary: salary.map((r) => ({ item: r.item, amount: r.amount })),
      cards: cardRows.map((r) => ({ name: r.name, amount: r.amount, baseSum: r.baseSum })),
      balances: balRows.map((r) => ({ account: r.account, amount: r.amount })),
      flows: flowRows.map((r) => ({ key: r.key, amount: r.amount, baseSum: r.baseSum, dir: r.dir, account: r.account })),
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

        <div style={styles.mcHead}>現金・投資・送金（今月の合計）</div>
        <div style={{ fontSize: 11.5, color: MUTED, margin: "0 2px 8px", lineHeight: 1.6 }}>
          自分の口座どうしの移動は入れなくてOK（残高で自動的に辻褄が合います）。
          <b>投資へ入れた分は残高が減りますが「使った」扱いにはしません</b>（貯蓄として集計）。
        </div>
        {flowRows.map((r, i) => (
          <div key={r.key} style={styles.mcRow}>
            <span style={styles.mcName}>{r.label}</span>
            <div style={{ flex: 1 }}>
              <AmountField value={r.amount} onChange={(v) => setFlow(i, v)} wrapStyle={styles.mcField} inputStyle={{ fontSize: 16 }} />
            </div>
            {accounts.length > 1 && (
              <select value={r.account} onChange={(e) => setFlowAccount(i, e.target.value)} style={styles.mcAcct} aria-label={`${r.label}の口座`}>
                {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
          </div>
        ))}

        {!showFlow && accounts.length > 0 && (
          <div style={{ ...styles.mcFlow, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>月末の口座残高を入れると、<br />「今月の動き」を自動で照合します。</div>
          </div>
        )}
        {showFlow && (
          <div style={styles.mcFlow}>
            <div style={styles.mcFlowHead}>今月の動き</div>
            <div style={styles.mcFlowRow}><span>給与（手取り）</span><span style={{ color: GREEN }}>{yen(takeHome)}</span></div>
            {otherIncome > 0 && <div style={styles.mcFlowRow}><span>受け取った</span><span style={{ color: GREEN }}>{yen(otherIncome)}</span></div>}
            <div style={styles.mcFlowRow}><span>カード引き落とし</span><span style={{ color: RED }}>{yen(-cardTotal)}</span></div>
            {cashSpend > 0 && <div style={styles.mcFlowRow}><span>現金引出・送金</span><span style={{ color: RED }}>{yen(-cashSpend)}</span></div>}
            {investNet !== 0 && <div style={styles.mcFlowRow}><span>投資へ回した（貯蓄）</span><span style={{ color: MUTED }}>{yen(-investNet)}</span></div>}
            <div style={{ ...styles.mcFlowRow, borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 8 }}>
              <span>残高の増減（実際）</span><span style={{ color: balChange >= 0 ? GREEN : RED }}>{yen(balChange)}</span>
            </div>
            <div style={{ ...styles.mcFlowRow, fontWeight: 600 }}>
              <span>まだ説明できていない分</span>
              <span style={{ color: Math.abs(unexplained) < 1 ? GREEN : RED }}>{Math.abs(unexplained) < 1 ? "なし" : yen(-Math.round(unexplained))}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
              {Math.abs(unexplained) < 1
                ? "残高の増減は入力した内容で説明できています。"
                : unexplained > 0
                  ? "この分だけ残高が余計に減っています。現金引出や送金の入れ忘れがないか確認してください。"
                  : "この分だけ残高が多いです。受け取りや戻しの入れ忘れがないか確認してください。"}
            </div>
          </div>
        )}

        <button style={styles.saveBtn} onClick={submit}>この内容で保存</button>
        <button style={styles.cancelBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
