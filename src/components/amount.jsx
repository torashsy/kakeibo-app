import React, { useRef, useState } from "react";
import { MUTED } from '../theme.js';
import { evalAmount } from '../utils';
import { styles } from '../styles.js';

const OPS = [["+", "＋"], ["-", "−"], ["*", "×"], ["/", "÷"]];
// 演算子を含むか(先頭のマイナス単独=ただの負数 は数式扱いしない)
const hasOperator = (s) => /[+*/×÷＋]/.test(String(s || "")) || /\d\s*[-−ー]/.test(String(s || ""));

// 金額入力欄。四則演算(1000+2000 など)を入力でき、フォーカス中は演算ボタンと「=結果」を表示する。
// 確定(blur)時に計算結果へ置き換える。保存側でも evalAmount するので、未blurのまま保存しても計算される。
export function AmountField({ value, onChange, placeholder = "0", autoFocus, wrapStyle, inputStyle }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const str = String(value ?? "");
  const showCalc = hasOperator(str);
  const result = showCalc ? evalAmount(str) : null;
  const append = (op) => { onChange(str + op); if (ref.current) ref.current.focus(); };
  const handleBlur = () => {
    setFocused(false);
    if (showCalc && result != null) onChange(String(Math.round(result)));
  };
  return (
    <div>
      <div style={{ ...styles.amountWrap, ...wrapStyle }}>
        <span style={styles.yenMark}>¥</span>
        <input
          ref={ref} type="text" inputMode="decimal" value={value ?? ""} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={handleBlur}
          autoFocus={autoFocus} style={{ ...styles.amountInput, ...inputStyle }}
        />
        {result != null && <span style={{ fontSize: 13, color: MUTED, marginLeft: 8, whiteSpace: "nowrap" }}>= {Math.round(result).toLocaleString("ja-JP")}</span>}
      </div>
      {focused && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {OPS.map(([op, l]) => (
            <button
              key={op} type="button" tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()} onClick={() => append(op)}
              style={{ ...styles.optionChip, flex: 1, textAlign: "center", fontSize: 16, padding: "8px 0" }}
            >{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}
